using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;

namespace CanonBridge
{
    /// <summary>
    /// Helper that keeps a Canon EOS camera for the MAX panel.
    ///
    /// The panel runs in a webview and cannot call a native DLL, so this
    /// process does it: Live View for the preview, a real still with
    /// autofocus on capture. No window; see canon-bridge.log and GET /status.
    ///
    ///   --port=8232          where to listen on 127.0.0.1
    ///   --parent-pid=1234    quit when this process is gone
    ///   --shots-dir=path     where /capture?save=1 keeps the originals
    ///   --allow-origin=url   one more page allowed to call the helper
    ///   --fake[=folder]      no camera: generated frames or live.jpg / still.jpg
    ///                        (same as the CANON_BRIDGE_FAKE environment variable)
    /// </summary>
    static class Program
    {
        public const string Version = "1.0.0";

        static readonly ManualResetEvent quit = new ManualResetEvent(false);

        [STAThread]
        static int Main(string[] args)
        {
            int port = 8232;
            int parentPid = 0;
            string shotsDir = null;
            string fakeDir = null;
            bool fake = false;
            List<string> origins = new List<string>();
            origins.Add("https://mascot-po.alavenir.space");
            origins.Add("https://mascot-po.alavenir.tech");

            foreach (string arg in args)
            {
                string value = arg.IndexOf('=') > 0 ? arg.Substring(arg.IndexOf('=') + 1).Trim('"') : "";
                if (arg.StartsWith("--port=")) int.TryParse(value, out port);
                else if (arg.StartsWith("--parent-pid=")) int.TryParse(value, out parentPid);
                else if (arg.StartsWith("--shots-dir=")) shotsDir = value;
                else if (arg.StartsWith("--allow-origin=")) origins.Add(value);
                else if (arg == "--fake") fake = true;
                else if (arg.StartsWith("--fake=")) { fake = true; fakeDir = value; }
            }

            // The panel starts the helper itself and passes no --fake, so for a
            // run of the packaged program without a camera there is a variable.
            string fakeEnv = Environment.GetEnvironmentVariable("CANON_BRIDGE_FAKE");
            if (!string.IsNullOrEmpty(fakeEnv))
            {
                fake = true;
                if (Directory.Exists(fakeEnv)) fakeDir = fakeEnv;
            }

            string home = AppDomain.CurrentDomain.BaseDirectory;
            Log.Init(Path.Combine(home, "canon-bridge.log"));
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
            {
                Log.Write("fatal: " + e.ExceptionObject);
                // No error dialog on a kiosk: the panel will start the helper again.
                Environment.Exit(1);
            };

            // The port doubles as the single-instance lock.
            TcpListener listener = new TcpListener(IPAddress.Loopback, port);
            try
            {
                listener.Start();
            }
            catch (SocketException)
            {
                Log.Write("port " + port + " is taken: another helper is already running, leaving");
                return 2;
            }

            Log.Write("canon-bridge " + Version + " started, port " + port + (fake ? ", fake camera" : "")
                + (parentPid > 0 ? ", parent " + parentPid : ""));

            ICameraBackend backend = fake ? (ICameraBackend)new FakeBackend(fakeDir) : new EdsdkBackend();
            CameraWorker worker = new CameraWorker(backend);
            HttpServer server = new HttpServer(listener, worker, shotsDir, origins, delegate { quit.Set(); });
            worker.Start();
            server.Start();

            if (parentPid > 0)
            {
                Thread watch = new Thread(delegate() { WatchParent(parentPid); });
                watch.IsBackground = true;
                watch.Start();
            }

            quit.WaitOne();

            // Close the session properly: a camera left with an open session
            // stays "busy" until the cable is replugged.
            server.Stop();
            worker.Stop();
            Log.Write("canon-bridge stopped");
            return 0;
        }

        static void WatchParent(int pid)
        {
            while (true)
            {
                Thread.Sleep(1500);
                bool alive;
                try
                {
                    using (Process parent = Process.GetProcessById(pid))
                    {
                        alive = !parent.HasExited;
                    }
                }
                catch (ArgumentException)
                {
                    alive = false;
                }
                catch (Exception)
                {
                    // No rights to look at the process: assume it is still there.
                    alive = true;
                }

                if (!alive)
                {
                    Log.Write("parent process is gone, leaving");
                    quit.Set();
                    return;
                }
            }
        }
    }
}
