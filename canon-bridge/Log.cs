using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace CanonBridge
{
    /// <summary>Monotonic clock in milliseconds, shared by all parts.</summary>
    static class Clock
    {
        static readonly Stopwatch watch = Stopwatch.StartNew();

        public static long Ms
        {
            get { return watch.ElapsedMilliseconds; }
        }
    }

    /// <summary>
    /// Log file next to the exe. The helper has no window, so this file and
    /// GET /log are the only way to see what happened on site.
    /// </summary>
    static class Log
    {
        const int TailLines = 300;
        const long MaxBytes = 2 * 1024 * 1024;

        static readonly object gate = new object();
        static readonly LinkedList<string> tail = new LinkedList<string>();
        static string path;
        static int sinceCheck;

        public static void Init(string file)
        {
            lock (gate) { path = file; }
        }

        public static void Write(string message)
        {
            string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message;
            lock (gate)
            {
                tail.AddLast(line);
                while (tail.Count > TailLines) tail.RemoveFirst();
                if (path == null) return;
                try
                {
                    if (++sinceCheck >= 200)
                    {
                        sinceCheck = 0;
                        FileInfo info = new FileInfo(path);
                        if (info.Exists && info.Length > MaxBytes)
                        {
                            string old = path + ".1";
                            if (File.Exists(old)) File.Delete(old);
                            File.Move(path, old);
                        }
                    }
                    File.AppendAllText(path, line + "\r\n", Encoding.UTF8);
                }
                catch (Exception)
                {
                    // A read-only folder must not stop the camera.
                }
            }
        }

        public static string Tail()
        {
            StringBuilder text = new StringBuilder();
            lock (gate)
            {
                foreach (string line in tail) text.Append(line).Append("\r\n");
            }
            return text.ToString();
        }
    }
}
