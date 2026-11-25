using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace CanonBridge
{
    /// <summary>
    /// The panel talks to the helper over plain HTTP on 127.0.0.1.
    ///
    /// A socket listener instead of HttpListener on purpose: no http.sys, no
    /// URL reservation, no administrator rights and no firewall prompt -
    /// the address is loopback only.
    ///
    ///   GET  /status       what the camera is doing
    ///   GET  /live.mjpg    preview for an img tag
    ///   GET  /frame.jpg    one fresh preview frame
    ///   POST /connect      take the camera
    ///   POST /disconnect   give it back (to use it as a webcam, for instance)
    ///   POST /focus        start focusing ahead of the shot
    ///   POST /capture      real picture, full-size JPEG in the body
    ///   GET  /log          tail of the log
    ///   POST /shutdown     quit
    /// </summary>
    sealed class HttpServer
    {
        const int CaptureTimeoutMs = 30000;
        /// <summary>
        /// How many preview streams may run at once. A page can leave a stream
        /// open behind it; without a limit such leftovers would keep Live View
        /// on for ever. Two: the panel window plus one more viewer.
        /// </summary>
        const int LiveStreams = 2;

        readonly TcpListener listener;
        readonly CameraWorker worker;
        readonly string shotsDir;
        readonly List<string> allowedOrigins;
        readonly Action shutdown;
        volatile bool stopping;
        long liveCounter;

        public HttpServer(TcpListener listener, CameraWorker worker, string shotsDir, List<string> allowedOrigins, Action shutdown)
        {
            this.listener = listener;
            this.worker = worker;
            this.shotsDir = shotsDir;
            this.allowedOrigins = allowedOrigins;
            this.shutdown = shutdown;
        }

        public void Start()
        {
            Thread thread = new Thread(Accept);
            thread.Name = "http";
            thread.IsBackground = true;
            thread.Start();
        }

        public void Stop()
        {
            stopping = true;
            try { listener.Stop(); } catch (Exception) { }
        }

        void Accept()
        {
            while (!stopping)
            {
                TcpClient client;
                try
                {
                    client = listener.AcceptTcpClient();
                }
                catch (Exception)
                {
                    if (stopping) return;
                    Thread.Sleep(50);
                    continue;
                }

                // A thread per connection: the preview stream holds one for as
                // long as the screen is open, the pool is not for that.
                Thread thread = new Thread(Serve);
                thread.IsBackground = true;
                thread.Start(client);
            }
        }

        void Serve(object state)
        {
            TcpClient client = (TcpClient)state;
            try
            {
                client.NoDelay = true;
                NetworkStream stream = client.GetStream();
                stream.ReadTimeout = 5000;
                stream.WriteTimeout = 8000;

                Request request = Request.Read(stream);
                if (request != null) Route(request, stream, client.Client);
            }
            catch (IOException) { }
            catch (SocketException) { }
            catch (ObjectDisposedException) { }
            catch (Exception error)
            {
                Log.Write("http: " + error);
            }
            finally
            {
                try { client.Close(); } catch (Exception) { }
            }
        }

        void Route(Request request, NetworkStream stream, Socket socket)
        {
            string origin = request.Header("origin");
            if (origin.Length > 0 && !OriginAllowed(origin))
            {
                Log.Write("refused origin " + origin);
                Reply(stream, 403, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("origin not allowed"), "", "");
                return;
            }

            if (request.Method == "OPTIONS")
            {
                Reply(stream, 204, null, null, origin, "");
                return;
            }

            bool post = request.Method == "POST";
            bool get = request.Method == "GET";

            if (get && request.Path == "/status")
            {
                Json(stream, 200, StatusJson(), origin);
            }
            else if (get && request.Path == "/log")
            {
                Reply(stream, 200, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(Log.Tail()), origin, "");
            }
            else if (get && request.Path == "/live.mjpg")
            {
                Live(stream, socket, origin);
            }
            else if (get && request.Path == "/frame.jpg")
            {
                worker.TouchLive();
                long seq;
                byte[] frame = worker.WaitFrame(worker.Status().FrameSeq, 4000, out seq);
                if (frame == null) Json(stream, 503, "{\"ok\":false,\"error\":" + Quote("Нет кадра Live View") + "}", origin);
                else Reply(stream, 200, "image/jpeg", frame, origin, "");
            }
            else if (post && request.Path == "/connect")
            {
                worker.Connect();
                Json(stream, 200, "{\"ok\":true}", origin);
            }
            else if (post && request.Path == "/disconnect")
            {
                worker.Disconnect();
                Json(stream, 200, "{\"ok\":true}", origin);
            }
            else if (post && request.Path == "/focus")
            {
                worker.Focus();
                Json(stream, 200, "{\"ok\":true}", origin);
            }
            else if (post && request.Path == "/capture")
            {
                Capture(stream, origin, request.Query.Contains("save=1"));
            }
            else if (post && request.Path == "/shutdown")
            {
                Json(stream, 200, "{\"ok\":true}", origin);
                Log.Write("shutdown requested over http");
                shutdown();
            }
            else
            {
                Json(stream, 404, "{\"ok\":false,\"error\":\"not found\"}", origin);
            }
        }

        void Capture(NetworkStream stream, string origin, bool save)
        {
            CaptureResult result = worker.Capture(CaptureTimeoutMs);
            if (result.Image == null)
            {
                Json(stream, 500, "{\"ok\":false,\"error\":" + Quote(result.Error ?? "Камера не сделала снимок") + "}", origin);
                return;
            }

            if (save && shotsDir != null)
            {
                try
                {
                    Directory.CreateDirectory(shotsDir);
                    string name = "canon-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".jpg";
                    File.WriteAllBytes(Path.Combine(shotsDir, name), result.Image);
                }
                catch (Exception error)
                {
                    Log.Write("could not save the original: " + error.Message);
                }
            }

            string headers =
                "X-Capture-Ms: " + result.Ms + "\r\n"
                + "X-Capture-Focused: " + (result.Focused ? "1" : "0") + "\r\n"
                + "X-Exif-Orientation: " + result.ExifOrientation + "\r\n"
                + "Access-Control-Expose-Headers: X-Capture-Ms, X-Capture-Focused, X-Exif-Orientation\r\n";
            Reply(stream, 200, "image/jpeg", result.Image, origin, headers);
        }

        void Live(NetworkStream stream, Socket socket, string origin)
        {
            const string boundary = "canonframe";
            StringBuilder head = new StringBuilder();
            head.Append("HTTP/1.1 200 OK\r\n");
            head.Append("Content-Type: multipart/x-mixed-replace; boundary=").Append(boundary).Append("\r\n");
            head.Append("Cache-Control: no-store\r\nConnection: close\r\n");
            head.Append(Cors(origin));
            head.Append("\r\n");
            byte[] bytes = Encoding.ASCII.GetBytes(head.ToString());
            stream.Write(bytes, 0, bytes.Length);

            // Only frames newer than this moment: the previous visitor's last
            // frame must not flash on the screen of the next one.
            long seq = worker.Status().FrameSeq;
            long mine = Interlocked.Increment(ref liveCounter);
            while (!stopping)
            {
                // Newer streams have pushed this one out.
                if (Interlocked.Read(ref liveCounter) - mine >= LiveStreams) return;
                worker.TouchLive();
                long next;
                byte[] frame = worker.WaitFrame(seq, 500, out next);
                if (frame == null)
                {
                    // Nothing to send, so a write cannot reveal a closed tab: ask the socket.
                    if (socket.Poll(0, SelectMode.SelectRead) && socket.Available == 0) return;
                    continue;
                }
                seq = next;

                byte[] part = Encoding.ASCII.GetBytes(
                    "--" + boundary + "\r\nContent-Type: image/jpeg\r\nContent-Length: " + frame.Length + "\r\n\r\n");
                stream.Write(part, 0, part.Length);
                stream.Write(frame, 0, frame.Length);
                stream.Write(new byte[] { 13, 10 }, 0, 2);
                stream.Flush();
            }
        }

        string StatusJson()
        {
            StatusSnapshot s = worker.Status();
            StringBuilder json = new StringBuilder();
            json.Append("{\"ok\":true");
            json.Append(",\"version\":").Append(Quote(Program.Version));
            json.Append(",\"backend\":").Append(Quote(s.Backend));
            json.Append(",\"state\":").Append(Quote(s.State));
            json.Append(",\"message\":").Append(Quote(s.Message));
            json.Append(",\"errorCode\":").Append(Quote(s.ErrorCode == 0 ? "" : "0x" + s.ErrorCode.ToString("X8")));
            json.Append(",\"camera\":").Append(Quote(s.Camera));
            json.Append(",\"liveView\":").Append(s.LiveView ? "true" : "false");
            json.Append(",\"frameSeq\":").Append(s.FrameSeq);
            json.Append(",\"frameWidth\":").Append(s.FrameWidth);
            json.Append(",\"frameHeight\":").Append(s.FrameHeight);
            json.Append(",\"fps\":").Append(s.Fps.ToString("0.0", CultureInfo.InvariantCulture));
            json.Append(",\"captures\":").Append(s.Captures);
            json.Append(",\"lastCaptureMs\":").Append(s.LastCaptureMs);
            json.Append(",\"lastCaptureBytes\":").Append(s.LastCaptureBytes);
            json.Append(",\"lastCaptureWidth\":").Append(s.LastCaptureWidth);
            json.Append(",\"lastCaptureHeight\":").Append(s.LastCaptureHeight);
            json.Append(",\"lastCaptureFocused\":").Append(s.LastCaptureFocused ? "true" : "false");
            json.Append(",\"lastCaptureError\":").Append(Quote(s.LastCaptureError));
            json.Append("}");
            return json.ToString();
        }

        bool OriginAllowed(string origin)
        {
            Uri uri;
            if (!Uri.TryCreate(origin, UriKind.Absolute, out uri)) return false;
            if (uri.Scheme == "http" && (uri.Host == "localhost" || uri.Host == "127.0.0.1")) return true;
            foreach (string allowed in allowedOrigins)
            {
                if (string.Equals(allowed, origin, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        static string Cors(string origin)
        {
            if (origin.Length == 0) return "";
            return "Access-Control-Allow-Origin: " + origin + "\r\nVary: Origin\r\n"
                + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: content-type\r\n"
                + "Access-Control-Allow-Private-Network: true\r\n"
                + "Access-Control-Max-Age: 600\r\n";
        }

        static void Json(NetworkStream stream, int status, string json, string origin)
        {
            Reply(stream, status, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json), origin, "");
        }

        static void Reply(NetworkStream stream, int status, string type, byte[] body, string origin, string extraHeaders)
        {
            string reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 403 ? "Forbidden"
                : status == 404 ? "Not Found" : status == 503 ? "Service Unavailable" : "Error";
            StringBuilder head = new StringBuilder();
            head.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
            if (type != null) head.Append("Content-Type: ").Append(type).Append("\r\n");
            head.Append("Content-Length: ").Append(body == null ? 0 : body.Length).Append("\r\n");
            head.Append("Cache-Control: no-store\r\nConnection: close\r\n");
            head.Append(Cors(origin));
            head.Append(extraHeaders);
            head.Append("\r\n");

            byte[] bytes = Encoding.ASCII.GetBytes(head.ToString());
            stream.Write(bytes, 0, bytes.Length);
            if (body != null && body.Length > 0) stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        static string Quote(string text)
        {
            StringBuilder result = new StringBuilder("\"");
            foreach (char c in text ?? "")
            {
                if (c == '"') result.Append("\\\"");
                else if (c == '\\') result.Append("\\\\");
                else if (c == '\n') result.Append("\\n");
                else if (c == '\r') result.Append("\\r");
                else if (c == '\t') result.Append("\\t");
                else if (c < 0x20) result.Append("\\u").Append(((int)c).ToString("x4"));
                else result.Append(c);
            }
            return result.Append('"').ToString();
        }
    }

    sealed class Request
    {
        public string Method = "";
        public string Path = "";
        public string Query = "";
        readonly Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public string Header(string name)
        {
            string value;
            return headers.TryGetValue(name, out value) ? value : "";
        }

        public static Request Read(NetworkStream stream)
        {
            byte[] buffer = new byte[16384];
            int used = 0;
            int headEnd = -1;
            while (headEnd < 0 && used < buffer.Length)
            {
                int got = stream.Read(buffer, used, buffer.Length - used);
                if (got <= 0) return null;
                used += got;
                for (int i = 3; i < used; i++)
                {
                    if (buffer[i - 3] == 13 && buffer[i - 2] == 10 && buffer[i - 1] == 13 && buffer[i] == 10)
                    {
                        headEnd = i + 1;
                        break;
                    }
                }
            }
            if (headEnd < 0) return null;

            string[] lines = Encoding.ASCII.GetString(buffer, 0, headEnd).Split(new[] { "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length == 0) return null;
            string[] first = lines[0].Split(' ');
            if (first.Length < 2) return null;

            Request request = new Request();
            request.Method = first[0].ToUpperInvariant();
            int mark = first[1].IndexOf('?');
            request.Path = mark < 0 ? first[1] : first[1].Substring(0, mark);
            request.Query = mark < 0 ? "" : first[1].Substring(mark + 1);
            for (int i = 1; i < lines.Length; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon > 0) request.headers[lines[i].Substring(0, colon).Trim()] = lines[i].Substring(colon + 1).Trim();
            }

            // The body is never used, but it has to be read off the socket.
            int length;
            if (int.TryParse(request.Header("content-length"), out length) && length > 0)
            {
                int left = length - (used - headEnd);
                byte[] sink = new byte[4096];
                while (left > 0)
                {
                    int got = stream.Read(sink, 0, Math.Min(sink.Length, left));
                    if (got <= 0) break;
                    left -= got;
                }
            }
            return request;
        }
    }
}
