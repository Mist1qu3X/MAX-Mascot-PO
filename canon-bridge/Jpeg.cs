using System;

namespace CanonBridge
{
    static class Jpeg
    {
        public static bool IsJpeg(byte[] data)
        {
            return data != null && data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8;
        }

        /// <summary>Picture size from the frame header, without decoding.</summary>
        public static bool ReadSize(byte[] data, out int width, out int height)
        {
            width = 0;
            height = 0;
            if (!IsJpeg(data)) return false;

            int i = 2;
            while (i + 9 < data.Length)
            {
                if (data[i] != 0xFF) return false;
                byte marker = data[i + 1];
                if (marker == 0xFF) { i++; continue; }
                if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
                if (marker == 0xDA || marker == 0xD9) return false;

                int length = (data[i + 2] << 8) | data[i + 3];
                bool frame = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
                if (frame)
                {
                    height = (data[i + 5] << 8) | data[i + 6];
                    width = (data[i + 7] << 8) | data[i + 8];
                    return width > 0 && height > 0;
                }
                i += 2 + length;
            }
            return false;
        }

        /// <summary>
        /// Sets the EXIF orientation tag to "as shot by the sensor" and returns
        /// the value it had (0 when the file has no such tag).
        ///
        /// Live View frames carry no orientation, the still does. Left alone,
        /// the browser would turn the still by the tag and the photo would no
        /// longer match the preview the visitor saw. The panel applies its own
        /// rotation setting to both.
        /// </summary>
        public static int NeutralizeOrientation(byte[] data)
        {
            if (!IsJpeg(data)) return 0;

            int i = 2;
            while (i + 4 < data.Length)
            {
                if (data[i] != 0xFF) return 0;
                byte marker = data[i + 1];
                if (marker == 0xFF) { i++; continue; }
                if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
                if (marker == 0xDA || marker == 0xD9) return 0;

                int length = (data[i + 2] << 8) | data[i + 3];
                if (marker == 0xE1 && i + 2 + length <= data.Length && length >= 16
                    && data[i + 4] == (byte)'E' && data[i + 5] == (byte)'x' && data[i + 6] == (byte)'i'
                    && data[i + 7] == (byte)'f' && data[i + 8] == 0 && data[i + 9] == 0)
                {
                    int tiff = i + 10;
                    int end = i + 2 + length;
                    bool little = data[tiff] == (byte)'I' && data[tiff + 1] == (byte)'I';
                    bool big = data[tiff] == (byte)'M' && data[tiff + 1] == (byte)'M';
                    if (!little && !big) return 0;

                    long ifd = tiff + Read32(data, tiff + 4, little);
                    if (ifd + 2 > end) return 0;
                    int count = Read16(data, (int)ifd, little);
                    for (int n = 0; n < count; n++)
                    {
                        int entry = (int)ifd + 2 + n * 12;
                        if (entry + 12 > end) return 0;
                        if (Read16(data, entry, little) != 0x0112) continue;

                        int original = Read16(data, entry + 8, little);
                        if (little) { data[entry + 8] = 1; data[entry + 9] = 0; }
                        else { data[entry + 8] = 0; data[entry + 9] = 1; }
                        return original;
                    }
                    return 0;
                }
                i += 2 + length;
            }
            return 0;
        }

        static int Read16(byte[] data, int at, bool little)
        {
            return little ? (data[at] | (data[at + 1] << 8)) : ((data[at] << 8) | data[at + 1]);
        }

        static long Read32(byte[] data, int at, bool little)
        {
            return little
                ? (long)(uint)(data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24))
                : (long)(uint)((data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]);
        }
    }
}
