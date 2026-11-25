using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Threading;

namespace CanonBridge
{
    /// <summary>
    /// Stand-in camera for work without a Canon on the desk (--fake[=folder]).
    ///
    /// With a folder: live.jpg is served as the preview and still.jpg as the
    /// photo. Marker files change the behaviour: "absent" - no camera,
    /// "nofocus" - the photo comes back as taken without focus,
    /// "fail" - the capture fails.
    /// </summary>
    sealed class FakeBackend : ICameraBackend
    {
        readonly string dir;
        bool connected;
        long lastFrameAt;
        int frames;
        int shots;

        public FakeBackend(string dir)
        {
            this.dir = dir;
        }

        public string Kind { get { return "fake"; } }
        public string Model { get { return "Имитация камеры"; } }
        public bool Connected { get { return connected; } }

        bool Marker(string name)
        {
            return dir != null && File.Exists(Path.Combine(dir, name));
        }

        byte[] FromFile(string name)
        {
            if (dir == null) return null;
            string path = Path.Combine(dir, name);
            return File.Exists(path) ? File.ReadAllBytes(path) : null;
        }

        public void Connect()
        {
            if (Marker("absent"))
                throw new CameraException("no-camera", "Камера Canon не найдена. Проверьте USB-кабель и питание камеры, закройте EOS Utility и EOS Webcam Utility");
            Thread.Sleep(300);
            connected = true;
        }

        public void Disconnect()
        {
            connected = false;
        }

        public void StartLiveView()
        {
            // A real body needs a moment to lift the mirror.
            lastFrameAt = Clock.Ms + 600;
        }

        public void StopLiveView() { }

        public byte[] GrabFrame()
        {
            if (Marker("absent")) throw new CameraException("no-camera", "Камера выключилась или отсоединена");
            if (Clock.Ms - lastFrameAt < 50) return null;
            lastFrameAt = Clock.Ms;
            frames++;
            return FromFile("live.jpg") ?? Draw(960, 640, "LIVE " + frames, 70);
        }

        public void StartFocus()
        {
            Log.Write("fake: focus");
        }

        public CaptureResult Capture()
        {
            Thread.Sleep(900);
            if (Marker("fail")) throw new CameraException("error", "Камера не прислала снимок: " + Eds.Describe(Eds.ErrTakePictureAfNg), Eds.ErrTakePictureAfNg);

            shots++;
            CaptureResult result = new CaptureResult();
            result.Image = FromFile("still.jpg") ?? Draw(3000, 2000, "STILL " + shots, 85);
            result.FileName = "IMG_" + shots.ToString("0000") + ".JPG";
            result.Focused = !Marker("nofocus");
            return result;
        }

        public void Tick() { }

        public void Shutdown() { }

        /// <summary>A frame with a clear top-left corner and a moving mark, so rotation, mirroring and freshness are visible.</summary>
        static byte[] Draw(int width, int height, string label, long quality)
        {
            using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb))
            using (Graphics g = Graphics.FromImage(bitmap))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (LinearGradientBrush back = new LinearGradientBrush(
                    new Rectangle(0, 0, width, height), Color.FromArgb(30, 60, 140), Color.FromArgb(150, 40, 110), 0f))
                {
                    g.FillRectangle(back, 0, 0, width, height);
                }

                float unit = height / 20f;
                g.FillRectangle(Brushes.Gold, 0, 0, unit * 4, unit * 4);
                using (Font small = new Font("Arial", unit * 0.9f, FontStyle.Bold))
                {
                    g.DrawString("TOP", small, Brushes.Black, unit * 0.4f, unit * 0.3f);
                    g.DrawString("LEFT", small, Brushes.Black, unit * 0.4f, unit * 1.8f);
                }

                float phase = (Clock.Ms % 4000) / 4000f;
                float x = width * (0.15f + 0.7f * phase);
                g.FillEllipse(Brushes.White, x - unit, height * 0.8f - unit, unit * 2, unit * 2);

                using (Font big = new Font("Arial", unit * 2f, FontStyle.Bold))
                {
                    g.DrawString(label, big, Brushes.White, unit * 5, unit * 7);
                    g.DrawString(DateTime.Now.ToString("HH:mm:ss.fff"), big, Brushes.White, unit * 5, unit * 10);
                }

                ImageCodecInfo codec = null;
                foreach (ImageCodecInfo candidate in ImageCodecInfo.GetImageEncoders())
                {
                    if (candidate.FormatID == ImageFormat.Jpeg.Guid) codec = candidate;
                }
                using (EncoderParameters options = new EncoderParameters(1))
                using (MemoryStream output = new MemoryStream())
                {
                    options.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                    bitmap.Save(output, codec, options);
                    return output.ToArray();
                }
            }
        }
    }
}
