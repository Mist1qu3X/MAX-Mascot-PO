using System;
using System.Threading;

namespace CanonBridge
{
    /// <summary>What went wrong, in a form the panel can show to the operator.</summary>
    sealed class CameraException : Exception
    {
        /// <summary>no-sdk, no-camera or error.</summary>
        public readonly string Kind;
        public readonly uint Code;

        public CameraException(string kind, string message, uint code) : base(message)
        {
            Kind = kind;
            Code = code;
        }

        public CameraException(string kind, string message) : this(kind, message, 0) { }
    }

    sealed class CaptureResult
    {
        public byte[] Image;
        public string FileName = "";
        /// <summary>False when the camera could not focus and the shot was taken anyway.</summary>
        public bool Focused = true;
        public int ExifOrientation;
        public long Ms;
        public string Error;
        /// <summary>Camera detail for the log and the status line.</summary>
        public string Note = "";
    }

    /// <summary>
    /// A camera. Every member is called from the camera thread only: EDSDK
    /// expects all calls to come from the thread that initialised it.
    /// </summary>
    interface ICameraBackend
    {
        string Kind { get; }
        string Model { get; }
        bool Connected { get; }
        void Connect();
        void Disconnect();
        void StartLiveView();
        void StopLiveView();
        /// <summary>Latest preview frame as JPEG, or null while the camera is not ready.</summary>
        byte[] GrabFrame();
        void StartFocus();
        CaptureResult Capture();
        /// <summary>Called on every loop pass: event pump and keep-alive.</summary>
        void Tick();
        void Shutdown();
    }

    sealed class StatusSnapshot
    {
        public string Backend;
        public string State;
        public string Message;
        public uint ErrorCode;
        public string Camera;
        public bool LiveView;
        public long FrameSeq;
        public int FrameWidth;
        public int FrameHeight;
        public double Fps;
        public int Captures;
        public long LastCaptureMs;
        public int LastCaptureBytes;
        public int LastCaptureWidth;
        public int LastCaptureHeight;
        public bool LastCaptureFocused;
        public string LastCaptureError;
    }

    /// <summary>
    /// Owns the camera thread. HTTP handlers only set wishes and wait:
    /// "keep the camera connected", "someone is watching the preview",
    /// "take a picture".
    /// </summary>
    sealed class CameraWorker
    {
        /// <summary>Live View stops this long after the last viewer left: the mirror goes down, the sensor cools.</summary>
        const int LiveIdleMs = 4000;
        const int ReconnectMs = 2000;

        readonly ICameraBackend backend;
        readonly Thread thread;
        readonly object gate = new object();
        volatile bool stopping;

        bool wantConnected;
        long lastLiveRequest = -100000;
        bool focusRequested;
        CaptureJob job;

        string state = "idle";
        string message = "";
        uint errorCode;
        bool liveView;
        byte[] frame;
        long frameSeq;
        int frameWidth, frameHeight;
        double fps;
        long lastFrameAt;

        int captures;
        long lastCaptureMs;
        int lastCaptureBytes, lastCaptureWidth, lastCaptureHeight;
        bool lastCaptureFocused = true;
        string lastCaptureError = "";

        sealed class CaptureJob
        {
            public readonly ManualResetEvent Done = new ManualResetEvent(false);
            public CaptureResult Result;
        }

        public CameraWorker(ICameraBackend backend)
        {
            this.backend = backend;
            thread = new Thread(Run);
            thread.Name = "camera";
            thread.IsBackground = true;
            // EDSDK is a COM-style library: single-threaded apartment plus a message pump.
            thread.SetApartmentState(ApartmentState.STA);
        }

        public void Start()
        {
            thread.Start();
        }

        public void Stop()
        {
            stopping = true;
            lock (gate) { Monitor.PulseAll(gate); }
            if (thread.IsAlive) thread.Join(4000);
        }

        public void Connect()
        {
            lock (gate) { wantConnected = true; }
        }

        public void Disconnect()
        {
            lock (gate) { wantConnected = false; }
        }

        /// <summary>
        /// Someone is looking at the preview: keep Live View on. It does not
        /// take the camera by itself - a preview stream that is still closing
        /// must not grab the camera back right after /disconnect.
        /// </summary>
        public void TouchLive()
        {
            lock (gate) { lastLiveRequest = Clock.Ms; }
        }

        public void Focus()
        {
            lock (gate)
            {
                wantConnected = true;
                focusRequested = true;
            }
        }

        public byte[] WaitFrame(long afterSeq, int timeoutMs, out long seq)
        {
            long deadline = Clock.Ms + timeoutMs;
            lock (gate)
            {
                while (frameSeq <= afterSeq && !stopping)
                {
                    long left = deadline - Clock.Ms;
                    if (left <= 0) break;
                    Monitor.Wait(gate, (int)left);
                }
                seq = frameSeq;
                return frameSeq > afterSeq ? frame : null;
            }
        }

        public CaptureResult Capture(int timeoutMs)
        {
            CaptureJob mine = new CaptureJob();
            lock (gate)
            {
                if (job != null)
                {
                    CaptureResult busy = new CaptureResult();
                    busy.Error = "Съёмка уже идёт";
                    return busy;
                }
                wantConnected = true;
                job = mine;
            }

            if (!mine.Done.WaitOne(timeoutMs))
            {
                lock (gate) { if (job == mine) job = null; }
                CaptureResult late = new CaptureResult();
                late.Error = "Камера не ответила за " + (timeoutMs / 1000) + " с";
                return late;
            }
            return mine.Result;
        }

        public StatusSnapshot Status()
        {
            lock (gate)
            {
                StatusSnapshot s = new StatusSnapshot();
                s.Backend = backend.Kind;
                s.State = state;
                s.Message = message;
                s.ErrorCode = errorCode;
                s.Camera = backend.Model ?? "";
                s.LiveView = liveView;
                s.FrameSeq = frameSeq;
                s.FrameWidth = frameWidth;
                s.FrameHeight = frameHeight;
                s.Fps = Clock.Ms - lastFrameAt > 2000 ? 0 : fps;
                s.Captures = captures;
                s.LastCaptureMs = lastCaptureMs;
                s.LastCaptureBytes = lastCaptureBytes;
                s.LastCaptureWidth = lastCaptureWidth;
                s.LastCaptureHeight = lastCaptureHeight;
                s.LastCaptureFocused = lastCaptureFocused;
                s.LastCaptureError = lastCaptureError;
                return s;
            }
        }

        void SetState(string next, string text, uint code)
        {
            bool changed;
            lock (gate)
            {
                changed = state != next || message != text;
                state = next;
                message = text;
                errorCode = code;
            }
            if (changed) Log.Write("state: " + next + (text.Length > 0 ? " - " + text : ""));
        }

        void Run()
        {
            Log.Write("camera thread started, backend=" + backend.Kind);
            long nextConnectAt = 0;

            while (!stopping)
            {
                bool want, wantLive, wantFocus;
                CaptureJob pending;
                lock (gate)
                {
                    want = wantConnected;
                    wantLive = Clock.Ms - lastLiveRequest < LiveIdleMs;
                    wantFocus = focusRequested;
                    focusRequested = false;
                    pending = job;
                }

                try
                {
                    if (!want)
                    {
                        if (backend.Connected) Drop("idle", "", 0);
                        else if (state != "idle") SetState("idle", "", 0);
                        Fail(pending, "Камера отключена");
                        Thread.Sleep(100);
                        continue;
                    }

                    if (!backend.Connected)
                    {
                        if (Clock.Ms < nextConnectAt)
                        {
                            Fail(pending, message.Length > 0 ? message : "Камера не подключена");
                            Thread.Sleep(50);
                            continue;
                        }
                        if (state == "idle") SetState("connecting", "", 0);
                        try
                        {
                            backend.Connect();
                            SetState("ready", "", 0);
                        }
                        catch (CameraException error)
                        {
                            SafeDisconnect();
                            SetState(error.Kind, error.Message, error.Code);
                            nextConnectAt = Clock.Ms + ReconnectMs;
                            continue;
                        }
                    }

                    if (pending != null)
                    {
                        TakePicture(pending);
                        continue;
                    }

                    if (wantFocus) backend.StartFocus();

                    if (wantLive && !liveView)
                    {
                        backend.StartLiveView();
                        lock (gate) { liveView = true; }
                        Log.Write("live view on");
                    }
                    else if (!wantLive && liveView)
                    {
                        backend.StopLiveView();
                        lock (gate) { liveView = false; }
                        Log.Write("live view off");
                    }

                    if (liveView)
                    {
                        byte[] next = backend.GrabFrame();
                        if (next != null) Publish(next);
                    }

                    backend.Tick();
                    Thread.Sleep(liveView ? 5 : 50);
                }
                catch (CameraException error)
                {
                    Log.Write("camera error: " + error.Message);
                    Fail(pending, error.Message);
                    Drop(error.Kind, error.Message, error.Code);
                    nextConnectAt = Clock.Ms + ReconnectMs;
                }
                catch (Exception error)
                {
                    Log.Write("unexpected: " + error);
                    Fail(pending, error.Message);
                    Drop("error", error.Message, 0);
                    nextConnectAt = Clock.Ms + ReconnectMs;
                }
            }

            SafeDisconnect();
            try { backend.Shutdown(); } catch (Exception) { }
            Log.Write("camera thread stopped");
        }

        void TakePicture(CaptureJob pending)
        {
            long started = Clock.Ms;
            CaptureResult result;
            try
            {
                result = backend.Capture();
            }
            catch (CameraException error)
            {
                result = new CaptureResult();
                result.Error = error.Message;
            }
            result.Ms = Clock.Ms - started;

            int width = 0, height = 0;
            if (result.Image != null)
            {
                result.ExifOrientation = Jpeg.NeutralizeOrientation(result.Image);
                Jpeg.ReadSize(result.Image, out width, out height);
            }

            lock (gate)
            {
                if (result.Image != null) captures++;
                lastCaptureMs = result.Ms;
                lastCaptureBytes = result.Image != null ? result.Image.Length : 0;
                lastCaptureWidth = width;
                lastCaptureHeight = height;
                lastCaptureFocused = result.Focused;
                lastCaptureError = result.Error ?? "";
                if (job == pending) job = null;
            }
            Log.Write(result.Image != null
                ? "capture ok: " + result.FileName + " " + width + "x" + height + ", " + result.Image.Length
                    + " bytes, " + result.Ms + " ms, focused=" + result.Focused + ", exif=" + result.ExifOrientation
                    + (result.Note.Length > 0 ? ", " + result.Note : "")
                : "capture failed after " + result.Ms + " ms: " + result.Error);

            pending.Result = result;
            pending.Done.Set();
        }

        void Fail(CaptureJob pending, string text)
        {
            if (pending == null) return;
            lock (gate) { if (job == pending) job = null; }
            CaptureResult result = new CaptureResult();
            result.Error = text;
            pending.Result = result;
            pending.Done.Set();
        }

        void Publish(byte[] next)
        {
            int width, height;
            Jpeg.ReadSize(next, out width, out height);
            lock (gate)
            {
                long now = Clock.Ms;
                if (lastFrameAt > 0 && now > lastFrameAt)
                {
                    double instant = 1000.0 / (now - lastFrameAt);
                    fps = fps <= 0 ? instant : fps * 0.9 + instant * 0.1;
                }
                lastFrameAt = now;
                frame = next;
                frameSeq++;
                frameWidth = width;
                frameHeight = height;
                Monitor.PulseAll(gate);
            }
        }

        void Drop(string nextState, string text, uint code)
        {
            SafeDisconnect();
            SetState(nextState, text, code);
        }

        void SafeDisconnect()
        {
            try { backend.Disconnect(); }
            catch (Exception error) { Log.Write("disconnect: " + error.Message); }
            lock (gate)
            {
                liveView = false;
                fps = 0;
            }
        }
    }
}
