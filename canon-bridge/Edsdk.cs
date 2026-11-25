using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace CanonBridge
{
    /// <summary>
    /// Canon EDSDK entry points and constants (EDSDK.h / EDSDKTypes.h /
    /// EDSDKErrors.h). The DLLs are not part of this repository: they come
    /// from the official Canon EDSDK x64 package and are put next to the exe.
    /// </summary>
    static class Eds
    {
        const string Dll = "EDSDK.dll";

        public const uint OK = 0x00000000;
        public const uint ErrNotSupported = 0x00000007;
        public const uint ErrInvalidHandle = 0x00000061;
        public const uint ErrDeviceNotFound = 0x00000080;
        public const uint ErrDeviceBusy = 0x00000081;
        public const uint ErrDeviceInvalid = 0x00000082;
        public const uint ErrSessionNotOpen = 0x00002003;
        public const uint ErrObjectNotReady = 0x0000A102;
        public const uint ErrTakePictureAfNg = 0x00008D01;

        public const uint PropSaveTo = 0x0000000B;
        public const uint PropEvfOutputDevice = 0x00000500;
        public const uint PropEvfMode = 0x00000501;

        public const uint SaveToHost = 2;
        public const uint EvfOutputPc = 2;

        public const uint CmdTakePicture = 0x00000000;
        public const uint CmdExtendShutDownTimer = 0x00000001;
        public const uint CmdPressShutterButton = 0x00000004;
        public const uint CmdDoEvfAf = 0x00000102;

        public const int ShutterOff = 0x00000000;
        public const int ShutterHalfway = 0x00000001;
        public const int ShutterCompletely = 0x00000003;
        public const int ShutterCompletelyNonAf = 0x00010003;

        public const uint ObjectEventAll = 0x00000200;
        public const uint ObjectEventDirItemRequestTransfer = 0x00000208;
        public const uint ObjectEventDirItemRequestTransferDt = 0x00000209;

        public const uint StateEventAll = 0x00000300;
        public const uint StateEventShutdown = 0x00000301;
        public const uint StateEventWillSoonShutDown = 0x00000303;
        public const uint StateEventCaptureError = 0x00000305;
        public const uint StateEventAfResult = 0x00000309;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public struct DeviceInfo
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string PortName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string Description;
            public uint SubType;
            public uint Reserved;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct Capacity
        {
            public int NumberOfFreeClusters;
            public int BytesPerSector;
            public int Reset;
        }

        public delegate uint ObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);
        public delegate uint StateEventHandler(uint inEvent, uint inParameter, IntPtr inContext);

        [DllImport(Dll)] public static extern uint EdsInitializeSDK();
        [DllImport(Dll)] public static extern uint EdsTerminateSDK();
        [DllImport(Dll)] public static extern uint EdsGetEvent();
        [DllImport(Dll)] public static extern uint EdsRelease(IntPtr inRef);

        [DllImport(Dll)] public static extern uint EdsGetCameraList(out IntPtr outCameraListRef);
        [DllImport(Dll)] public static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);
        [DllImport(Dll)] public static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outRef);
        [DllImport(Dll)] public static extern uint EdsGetDeviceInfo(IntPtr inCameraRef, out DeviceInfo outDeviceInfo);

        [DllImport(Dll)] public static extern uint EdsOpenSession(IntPtr inCameraRef);
        [DllImport(Dll)] public static extern uint EdsCloseSession(IntPtr inCameraRef);
        [DllImport(Dll)] public static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);
        [DllImport(Dll)] public static extern uint EdsSetCapacity(IntPtr inCameraRef, Capacity inCapacity);

        [DllImport(Dll)]
        public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, out uint outPropertyData);

        [DllImport(Dll)]
        public static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, ref uint inPropertyData);

        [DllImport(Dll)]
        public static extern uint EdsSetObjectEventHandler(IntPtr inCameraRef, uint inEvent, ObjectEventHandler inHandler, IntPtr inContext);

        [DllImport(Dll)]
        public static extern uint EdsSetCameraStateEventHandler(IntPtr inCameraRef, uint inEvent, StateEventHandler inHandler, IntPtr inContext);

        // The directory item layout differs between EDSDK generations (32-bit
        // size in old ones, 64-bit since 3.x), so it is read as raw bytes.
        [DllImport(Dll)] public static extern uint EdsGetDirectoryItemInfo(IntPtr inDirItemRef, IntPtr outDirItemInfo);
        [DllImport(Dll)] public static extern uint EdsDownload(IntPtr inDirItemRef, ulong inReadSize, IntPtr outStream);
        [DllImport(Dll)] public static extern uint EdsDownloadComplete(IntPtr inDirItemRef);
        [DllImport(Dll)] public static extern uint EdsDownloadCancel(IntPtr inDirItemRef);

        [DllImport(Dll)] public static extern uint EdsCreateMemoryStream(ulong inBufferSize, out IntPtr outStream);
        [DllImport(Dll)] public static extern uint EdsGetPointer(IntPtr inStreamRef, out IntPtr outPointer);
        [DllImport(Dll)] public static extern uint EdsGetLength(IntPtr inStreamRef, out ulong outLength);

        [DllImport(Dll)] public static extern uint EdsCreateEvfImageRef(IntPtr inStreamRef, out IntPtr outEvfImageRef);
        [DllImport(Dll)] public static extern uint EdsDownloadEvfImage(IntPtr inCameraRef, IntPtr inEvfImageRef);

        /// <summary>Communication is gone: the session has to be reopened.</summary>
        public static bool IsLost(uint code)
        {
            return (code >= 0xC0 && code <= 0xDF) || code == ErrDeviceNotFound || code == ErrDeviceInvalid
                || code == ErrSessionNotOpen || code == ErrInvalidHandle;
        }

        public static string Describe(uint code)
        {
            string hex = "0x" + code.ToString("X8");
            switch (code)
            {
                case 0x00000002: return "внутренняя ошибка камеры (" + hex + ")";
                case ErrNotSupported: return "камера не поддерживает команду (" + hex + ")";
                case ErrInvalidHandle: return "связь с камерой потеряна (" + hex + ")";
                case ErrDeviceNotFound: return "камера не найдена (" + hex + ")";
                case ErrDeviceBusy: return "камера занята (" + hex + ")";
                case ErrDeviceInvalid: return "камера недоступна (" + hex + ")";
                case 0x000000C0: return "камера занята другой программой: закройте EOS Utility и EOS Webcam Utility (" + hex + ")";
                case 0x000000C1: return "камера отсоединена (" + hex + ")";
                case 0x000000C3: return "ошибка USB: проверьте кабель и порт (" + hex + ")";
                case ErrSessionNotOpen: return "сеанс с камерой закрыт (" + hex + ")";
                case ErrObjectNotReady: return "камера ещё не готова (" + hex + ")";
                case ErrTakePictureAfNg: return "камера не смогла навести резкость (" + hex + ")";
                case 0x00008D03: return "зеркало поднято, съёмка невозможна (" + hex + ")";
                case 0x00008D06: return "в камере нет карты памяти, а сохранение на компьютер не включилось (" + hex + ")";
                case 0x00008D07: return "ошибка карты памяти (" + hex + ")";
                case 0x00008D08: return "карта памяти защищена от записи (" + hex + ")";
                case 0x00008D0A: return "вспышка заряжается (" + hex + ")";
                case 0x00008D0B: return "нет объектива (" + hex + ")";
                case 0x00008D0C: return "камера в режиме видео: переключите диск на фото (" + hex + ")";
                case 0x00008D0D: return "в этом режиме камера не снимает из Live View (" + hex + ")";
                default:
                    if (code >= 0x00008D00 && code <= 0x00008DFF) return "камера отказалась снимать (" + hex + ")";
                    if (code >= 0xC0 && code <= 0xDF) return "ошибка связи с камерой (" + hex + ")";
                    return "ошибка EDSDK " + hex;
            }
        }
    }

    /// <summary>Canon EOS over USB through EDSDK: Live View for preview, a real still on capture.</summary>
    sealed class EdsdkBackend : ICameraBackend
    {
        /// <summary>No preview frame this long after Live View was switched on means it will not come.</summary>
        const int FirstFrameMs = 10000;
        const int KeepAliveMs = 30000;
        const int ImageWaitMs = 9000;
        const int ImageRetryWaitMs = 7000;
        const ulong MaxFileBytes = 300UL * 1024 * 1024;

        // Kept in fields: the SDK holds raw pointers to them, the GC must not collect them.
        readonly Eds.ObjectEventHandler onObject;
        readonly Eds.StateEventHandler onState;

        readonly object itemsGate = new object();
        readonly Queue<IntPtr> items = new Queue<IntPtr>();

        IntPtr camera = IntPtr.Zero;
        string model = "";
        bool sdkReady;
        bool sessionOpen;
        bool liveOn;
        bool evfAfOn;
        bool hasGetEvent = true;
        long liveSince;
        long framesSinceLive;
        int frameErrors;
        int emptyScans;
        long lastKeepAlive;
        volatile bool lost;
        volatile bool extendTimer;
        volatile uint captureError;

        public EdsdkBackend()
        {
            onObject = OnObject;
            onState = OnState;
        }

        public string Kind { get { return "edsdk"; } }
        public string Model { get { return model; } }
        public bool Connected { get { return camera != IntPtr.Zero && sessionOpen; } }

        public void Connect()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            if (!File.Exists(Path.Combine(dir, "EDSDK.dll")))
            {
                throw new CameraException("no-sdk",
                    "Не найдена EDSDK.dll. Положите 64-битные EDSDK.dll и EdsImage.dll из комплекта Canon EDSDK в папку " + dir);
            }

            try
            {
                Open();
            }
            catch (DllNotFoundException error)
            {
                throw new CameraException("no-sdk",
                    "Не загрузилась EDSDK.dll: рядом должны лежать 64-битные EDSDK.dll и EdsImage.dll из одного комплекта (" + error.Message + ")");
            }
            catch (BadImageFormatException)
            {
                throw new CameraException("no-sdk", "EDSDK.dll не 64-битная. Нужна версия x64 из комплекта Canon EDSDK");
            }
            catch (EntryPointNotFoundException error)
            {
                throw new CameraException("no-sdk", "В этой EDSDK.dll нет нужной функции: " + error.Message);
            }
        }

        void Open()
        {
            if (!sdkReady)
            {
                uint init = Eds.EdsInitializeSDK();
                if (init != Eds.OK) throw new CameraException("error", "EDSDK не запустилась: " + Eds.Describe(init), init);
                sdkReady = true;
                Log.Write("EDSDK initialised");
            }

            // Lets the SDK notice a camera that was plugged in after the start.
            Pump();

            IntPtr list;
            uint err = Eds.EdsGetCameraList(out list);
            if (err != Eds.OK) throw new CameraException("error", "Не удалось получить список камер: " + Eds.Describe(err), err);

            int count;
            err = Eds.EdsGetChildCount(list, out count);
            if (err != Eds.OK || count <= 0)
            {
                Eds.EdsRelease(list);
                // Rare, but the list can stay empty for a camera connected late:
                // start the SDK again once in a while.
                if (++emptyScans >= 15)
                {
                    emptyScans = 0;
                    Eds.EdsTerminateSDK();
                    sdkReady = false;
                    Log.Write("EDSDK restarted: no camera in the list for a long time");
                }
                throw new CameraException("no-camera",
                    "Камера Canon не найдена. Проверьте USB-кабель и питание камеры, закройте EOS Utility и EOS Webcam Utility");
            }
            emptyScans = 0;

            IntPtr found;
            err = Eds.EdsGetChildAtIndex(list, 0, out found);
            Eds.EdsRelease(list);
            if (err != Eds.OK || found == IntPtr.Zero)
                throw new CameraException("error", "Камера не открывается: " + Eds.Describe(err), err);

            Eds.DeviceInfo info;
            if (Eds.EdsGetDeviceInfo(found, out info) == Eds.OK) model = info.Description ?? "";

            err = Eds.EdsOpenSession(found);
            if (err != Eds.OK)
            {
                Eds.EdsRelease(found);
                throw new CameraException("error", "Камера " + model + " найдена, но не открывается: " + Eds.Describe(err), err);
            }

            camera = found;
            sessionOpen = true;
            lost = false;
            liveOn = false;
            evfAfOn = false;
            captureError = 0;
            lastKeepAlive = Clock.Ms;

            Warn(Eds.EdsSetObjectEventHandler(camera, Eds.ObjectEventAll, onObject, IntPtr.Zero), "EdsSetObjectEventHandler");
            Warn(Eds.EdsSetCameraStateEventHandler(camera, Eds.StateEventAll, onState, IntPtr.Zero), "EdsSetCameraStateEventHandler");

            // Pictures go to the computer, so the camera works without a card.
            err = SetProperty(Eds.PropSaveTo, Eds.SaveToHost);
            if (err != Eds.OK)
                throw new CameraException("error", "Не удалось включить сохранение снимков на компьютер: " + Eds.Describe(err), err);

            Eds.Capacity capacity = new Eds.Capacity();
            capacity.NumberOfFreeClusters = 0x7FFFFFFF;
            capacity.BytesPerSector = 0x1000;
            capacity.Reset = 1;
            Warn(Eds.EdsSetCapacity(camera, capacity), "EdsSetCapacity");

            Log.Write("camera connected: " + model);
        }

        public void Disconnect()
        {
            if (camera == IntPtr.Zero) return;
            try
            {
                if (liveOn && !lost) StopLiveView();
            }
            catch (Exception) { }

            if (sessionOpen) Eds.EdsCloseSession(camera);
            Eds.EdsRelease(camera);
            camera = IntPtr.Zero;
            sessionOpen = false;
            liveOn = false;
            evfAfOn = false;
            ReleaseItems(false);
            Log.Write("camera released");
        }

        public void Shutdown()
        {
            if (!sdkReady) return;
            Eds.EdsTerminateSDK();
            sdkReady = false;
        }

        public void StartLiveView()
        {
            // Bodies with a "Live View shooting: disable" menu item refuse the
            // output device until the function itself is enabled.
            uint mode;
            if (Eds.EdsGetPropertyData(camera, Eds.PropEvfMode, 0, 4, out mode) == Eds.OK && mode == 0)
                Warn(SetProperty(Eds.PropEvfMode, 1), "Evf_Mode");

            uint device;
            if (Eds.EdsGetPropertyData(camera, Eds.PropEvfOutputDevice, 0, 4, out device) != Eds.OK) device = 0;
            uint err = SetProperty(Eds.PropEvfOutputDevice, device | Eds.EvfOutputPc);
            if (err != Eds.OK) throw new CameraException("error", "Live View не включается: " + Eds.Describe(err), err);

            liveOn = true;
            liveSince = Clock.Ms;
            framesSinceLive = 0;
            frameErrors = 0;
        }

        public void StopLiveView()
        {
            liveOn = false;
            uint device;
            if (Eds.EdsGetPropertyData(camera, Eds.PropEvfOutputDevice, 0, 4, out device) != Eds.OK) return;
            Warn(SetProperty(Eds.PropEvfOutputDevice, device & ~Eds.EvfOutputPc), "Evf_OutputDevice off");
        }

        public byte[] GrabFrame()
        {
            IntPtr stream = IntPtr.Zero;
            IntPtr image = IntPtr.Zero;
            try
            {
                if (Eds.EdsCreateMemoryStream(0, out stream) != Eds.OK) return null;
                if (Eds.EdsCreateEvfImageRef(stream, out image) != Eds.OK) return null;

                uint err = Eds.EdsDownloadEvfImage(camera, image);
                if (err == Eds.OK)
                {
                    byte[] data = ReadStream(stream, 0);
                    if (!Jpeg.IsJpeg(data)) return null;
                    frameErrors = 0;
                    framesSinceLive++;
                    return data;
                }

                // Right after Live View is switched on, and while the shutter
                // works, the camera answers "not ready": that is the normal wait.
                if (err == Eds.ErrObjectNotReady || err == Eds.ErrDeviceBusy)
                {
                    if (framesSinceLive == 0 && Clock.Ms - liveSince > FirstFrameMs)
                    {
                        throw new CameraException("error",
                            "Live View включён, но камера не отдаёт картинку. Проверьте, что диск режимов стоит на фото, а не на видео", err);
                    }
                    return null;
                }

                frameErrors++;
                if (frameErrors == 1 || frameErrors % 100 == 0) Log.Write("live view frame: " + Eds.Describe(err));
                if (Eds.IsLost(err) || frameErrors > 200)
                    throw new CameraException("error", "Связь с камерой потеряна: " + Eds.Describe(err), err);
                return null;
            }
            finally
            {
                if (image != IntPtr.Zero) Eds.EdsRelease(image);
                if (stream != IntPtr.Zero) Eds.EdsRelease(stream);
            }
        }

        public void StartFocus()
        {
            // Half-press: the camera focuses and holds, so the full press a
            // moment later fires without the autofocus delay.
            uint err = Send(Eds.CmdPressShutterButton, Eds.ShutterHalfway);
            if (err == Eds.OK) return;

            Log.Write("half-press refused: " + Eds.Describe(err) + ", trying Live View autofocus");
            Eds.EdsSendCommand(camera, Eds.CmdPressShutterButton, Eds.ShutterOff);
            if (Eds.EdsSendCommand(camera, Eds.CmdDoEvfAf, 1) == Eds.OK) evfAfOn = true;
        }

        public CaptureResult Capture()
        {
            CaptureResult result = new CaptureResult();
            ReleaseItems(true);
            captureError = 0;

            if (evfAfOn)
            {
                Eds.EdsSendCommand(camera, Eds.CmdDoEvfAf, 0);
                evfAfOn = false;
            }

            bool focused = true;
            uint err = Send(Eds.CmdPressShutterButton, Eds.ShutterCompletely);
            if (err != Eds.OK)
            {
                Log.Write("full press refused: " + Eds.Describe(err));
                Eds.EdsSendCommand(camera, Eds.CmdPressShutterButton, Eds.ShutterOff);
                if (Eds.IsLost(err)) throw new CameraException("error", "Связь с камерой потеряна: " + Eds.Describe(err), err);

                if (err == Eds.ErrNotSupported)
                {
                    err = Send(Eds.CmdTakePicture, 0);
                    result.Note = "TakePicture";
                }
                else
                {
                    // No focus is better than no picture: shoot as is.
                    PumpFor(150);
                    err = Send(Eds.CmdPressShutterButton, Eds.ShutterCompletelyNonAf);
                    focused = false;
                }
                if (err != Eds.OK)
                {
                    Eds.EdsSendCommand(camera, Eds.CmdPressShutterButton, Eds.ShutterOff);
                    throw new CameraException("error", "Камера не сделала снимок: " + Eds.Describe(err), err);
                }
            }
            Eds.EdsSendCommand(camera, Eds.CmdPressShutterButton, Eds.ShutterOff);

            byte[] image = WaitForImage(ImageWaitMs, result);
            if (image == null && focused)
            {
                // The press was accepted but nothing came: the usual reason is
                // autofocus that hunted and gave up.
                Log.Write("no picture after the press" + (captureError != 0 ? " (" + Eds.Describe(captureError) + ")" : "")
                    + ", repeating without autofocus");
                captureError = 0;
                focused = false;
                err = Send(Eds.CmdPressShutterButton, Eds.ShutterCompletelyNonAf);
                Eds.EdsSendCommand(camera, Eds.CmdPressShutterButton, Eds.ShutterOff);
                if (err == Eds.OK) image = WaitForImage(ImageRetryWaitMs, result);
                else captureError = err;
            }

            if (image == null)
            {
                uint code = captureError;
                throw new CameraException("error",
                    "Камера не прислала снимок" + (code != 0 ? ": " + Eds.Describe(code) : ""), code);
            }

            result.Image = image;
            result.Focused = focused;
            return result;
        }

        byte[] WaitForImage(int timeoutMs, CaptureResult result)
        {
            long deadline = Clock.Ms + timeoutMs;
            while (Clock.Ms < deadline)
            {
                Pump();
                if (lost) throw new CameraException("error", "Камера отключилась во время съёмки");

                IntPtr item;
                while (TakeItem(out item))
                {
                    string name;
                    byte[] data = Download(item, out name);
                    if (Jpeg.IsJpeg(data))
                    {
                        result.FileName = name;
                        return data;
                    }
                    if (name.Length > 0) Log.Write("skipped " + name + ": not a JPEG");
                }

                if (captureError != 0) return null;
                Thread.Sleep(10);
            }
            return null;
        }

        byte[] Download(IntPtr item, out string name)
        {
            name = "";
            byte[] raw = new byte[1024];
            GCHandle pin = GCHandle.Alloc(raw, GCHandleType.Pinned);
            uint err;
            try
            {
                err = Eds.EdsGetDirectoryItemInfo(item, pin.AddrOfPinnedObject());
            }
            finally
            {
                pin.Free();
            }
            if (err != Eds.OK)
            {
                Log.Write("EdsGetDirectoryItemInfo: " + Eds.Describe(err));
                Eds.EdsDownloadCancel(item);
                Eds.EdsRelease(item);
                return null;
            }

            // New layout: 64-bit size first. Old layout: 32-bit size followed by
            // the folder flag, which is zero for a file - so the first eight
            // bytes read as one number give the size in both.
            ulong size = BitConverter.ToUInt64(raw, 0);
            if (size == 0 || size > MaxFileBytes) size = BitConverter.ToUInt32(raw, 0);
            name = ReadName(raw);

            string ext = Path.GetExtension(name).ToUpperInvariant();
            if (size == 0 || size > MaxFileBytes || ext == ".CR2" || ext == ".CR3" || ext == ".CRW")
            {
                // RAW of a RAW+JPEG pair, or something unreadable: refuse it,
                // otherwise the camera stays busy waiting for the computer.
                Eds.EdsDownloadCancel(item);
                Eds.EdsRelease(item);
                return null;
            }

            IntPtr stream = IntPtr.Zero;
            try
            {
                err = Eds.EdsCreateMemoryStream(size, out stream);
                if (err == Eds.OK) err = Eds.EdsDownload(item, size, stream);
                if (err != Eds.OK)
                {
                    Log.Write("EdsDownload " + name + ": " + Eds.Describe(err));
                    Eds.EdsDownloadCancel(item);
                    return null;
                }
                Warn(Eds.EdsDownloadComplete(item), "EdsDownloadComplete");
                return ReadStream(stream, size);
            }
            finally
            {
                if (stream != IntPtr.Zero) Eds.EdsRelease(stream);
                Eds.EdsRelease(item);
            }
        }

        static string ReadName(byte[] raw)
        {
            // The name follows the size, the folder flag, the group id and the
            // option: at byte 16 in the old layout, at byte 20 in the new one.
            string old = Ascii(raw, 16);
            string current = Ascii(raw, 20);
            if (LooksLikeFile(old)) return old;
            if (LooksLikeFile(current)) return current;
            return current.Length > 0 ? current : old;
        }

        static string Ascii(byte[] raw, int at)
        {
            int end = at;
            while (end < raw.Length && end < at + 256 && raw[end] != 0) end++;
            return Encoding.ASCII.GetString(raw, at, end - at);
        }

        static bool LooksLikeFile(string name)
        {
            if (name.Length < 5 || name.IndexOf('.') <= 0) return false;
            foreach (char c in name)
            {
                if (c < 0x20 || c > 0x7E) return false;
            }
            return true;
        }

        static byte[] ReadStream(IntPtr stream, ulong expected)
        {
            IntPtr pointer;
            ulong length;
            if (Eds.EdsGetPointer(stream, out pointer) != Eds.OK || pointer == IntPtr.Zero) return null;
            if (Eds.EdsGetLength(stream, out length) != Eds.OK || length == 0) length = expected;
            if (expected > 0 && length > expected) length = expected;
            if (length == 0 || length > MaxFileBytes) return null;

            byte[] data = new byte[(int)length];
            Marshal.Copy(pointer, data, 0, data.Length);
            return data;
        }

        public void Tick()
        {
            Pump();
            if (lost) throw new CameraException("no-camera", "Камера выключилась или отсоединена");

            // Someone pressed the shutter on the body: the camera now waits for
            // the computer to take the file. Refuse it and stay ready.
            ReleaseItems(true);

            if (extendTimer || Clock.Ms - lastKeepAlive > KeepAliveMs)
            {
                extendTimer = false;
                lastKeepAlive = Clock.Ms;
                Eds.EdsSendCommand(camera, Eds.CmdExtendShutDownTimer, 0);
            }
        }

        /// <summary>Delivers camera events: they arrive only while someone pumps.</summary>
        void Pump()
        {
            if (hasGetEvent)
            {
                try
                {
                    Eds.EdsGetEvent();
                }
                catch (EntryPointNotFoundException)
                {
                    hasGetEvent = false;
                    Log.Write("this EDSDK has no EdsGetEvent, using the message loop only");
                }
            }
            Application.DoEvents();
        }

        void PumpFor(int ms)
        {
            long until = Clock.Ms + ms;
            while (Clock.Ms < until)
            {
                Pump();
                Thread.Sleep(10);
            }
        }

        /// <summary>A command with a short wait through "camera busy".</summary>
        uint Send(uint command, int parameter)
        {
            uint err = Eds.OK;
            for (int attempt = 0; attempt < 12; attempt++)
            {
                err = Eds.EdsSendCommand(camera, command, parameter);
                if (err != Eds.ErrDeviceBusy) return err;
                PumpFor(100);
            }
            return err;
        }

        uint SetProperty(uint id, uint value)
        {
            uint err = Eds.OK;
            for (int attempt = 0; attempt < 12; attempt++)
            {
                uint data = value;
                err = Eds.EdsSetPropertyData(camera, id, 0, 4, ref data);
                if (err != Eds.ErrDeviceBusy) return err;
                PumpFor(100);
            }
            return err;
        }

        static void Warn(uint err, string what)
        {
            if (err != Eds.OK) Log.Write(what + ": " + Eds.Describe(err));
        }

        bool TakeItem(out IntPtr item)
        {
            lock (itemsGate)
            {
                if (items.Count == 0)
                {
                    item = IntPtr.Zero;
                    return false;
                }
                item = items.Dequeue();
                return true;
            }
        }

        void ReleaseItems(bool cancel)
        {
            IntPtr item;
            while (TakeItem(out item))
            {
                if (cancel) Eds.EdsDownloadCancel(item);
                Eds.EdsRelease(item);
                Log.Write("dropped a picture the panel did not ask for");
            }
        }

        // Callbacks only take notes: the SDK may call them from its own thread,
        // and everything else belongs to the camera thread.

        uint OnObject(uint inEvent, IntPtr inRef, IntPtr inContext)
        {
            try
            {
                if (inEvent == Eds.ObjectEventDirItemRequestTransfer || inEvent == Eds.ObjectEventDirItemRequestTransferDt)
                {
                    lock (itemsGate) { items.Enqueue(inRef); }
                }
                else if (inRef != IntPtr.Zero)
                {
                    Eds.EdsRelease(inRef);
                }
            }
            catch (Exception) { }
            return Eds.OK;
        }

        uint OnState(uint inEvent, uint inParameter, IntPtr inContext)
        {
            if (inEvent == Eds.StateEventShutdown) lost = true;
            else if (inEvent == Eds.StateEventWillSoonShutDown) extendTimer = true;
            else if (inEvent == Eds.StateEventCaptureError) captureError = inParameter;
            return Eds.OK;
        }
    }
}
