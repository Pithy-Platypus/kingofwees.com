using System.Text;

namespace KingOfWees.Server.Tests.Photos;

// JPEGs for API tests: whole enough for JpegMetadata.Strip, with an EXIF block that carries a made-up GPS point.
public static class TestJpeg
{
    public const string GpsText = "GPS 45.523456 -122.677123";

    private static readonly byte[] Exif = Segment(0xE1, Encoding.ASCII.GetBytes($"Exif\0\0{GpsText}"));
    private static readonly byte[] Frame = Segment(0xC0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
    private static readonly byte[] Scan = Segment(0xDA, [1, 1, 0, 0, 0x3F, 0]);

    /// <summary>A minimal JPEG of <paramref name="size"/> bytes (the scan data fills it), plus an EXIF block if asked.</summary>
    public static byte[] Make(int size = 64, bool withExif = false)
    {
        var filler = Enumerable.Repeat((byte)0x2A, Math.Max(1, size - 4 - Frame.Length - Scan.Length));
        return [0xFF, 0xD8, .. withExif ? Exif : [], .. Frame, .. Scan, .. filler, 0xFF, 0xD9];
    }

    private static byte[] Segment(byte code, byte[] payload) =>
        [0xFF, code, (byte)((payload.Length + 2) >> 8), (byte)(payload.Length + 2), .. payload];
}
