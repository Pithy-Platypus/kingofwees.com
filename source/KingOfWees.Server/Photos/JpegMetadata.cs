namespace KingOfWees.Server.Photos;

// The browser's re-encode already drops EXIF; this is the server's own guarantee, since anyone can post bytes directly.
// Phone photos carry the exact GPS point in EXIF/XMP, which would bypass block rounding (docs/patterns/location-privacy.md).
public static class JpegMetadata
{
    private const byte Marker = 0xFF;
    private const byte StartOfImage = 0xD8;
    private const byte EndOfImage = 0xD9;
    private const byte StartOfScan = 0xDA;
    private const byte FirstApp = 0xE0; // APP0 (JFIF) is kept: density and version only.
    private const byte LastApp = 0xEF;
    private const byte Comment = 0xFE;

    /// <summary>
    /// The same JPEG without APP1–APP15 segments (EXIF, XMP, ICC, maker notes), comments or anything after the end of the
    /// image; every other segment and the compressed image data are copied byte for byte. No decoding, no image library.
    /// </summary>
    /// <returns>Null when the input isn't a whole JPEG.</returns>
    public static byte[]? Strip(ReadOnlySpan<byte> jpeg)
    {
        if (jpeg.Length < 4 || jpeg[0] != Marker || jpeg[1] != StartOfImage) return null;

        var output = new List<byte>(jpeg.Length);
        output.AddRange([Marker, StartOfImage]);
        var position = 2;
        var sawScan = false;
        while (position + 1 < jpeg.Length)
        {
            if (jpeg[position] != Marker) return null;
            while (position + 1 < jpeg.Length && jpeg[position + 1] == Marker) position++; // fill bytes
            if (position + 1 >= jpeg.Length) return null;
            var code = jpeg[position + 1];
            position += 2;

            if (code == EndOfImage)
            {
                if (!sawScan) return null;
                output.AddRange([Marker, EndOfImage]);
                return [.. output];
            }

            if (position + 2 > jpeg.Length) return null;
            var length = (jpeg[position] << 8) | jpeg[position + 1];
            if (length < 2 || position + length > jpeg.Length) return null;
            var keep = code is not (>= FirstApp + 1 and <= LastApp) and not Comment;
            if (keep)
            {
                output.AddRange([Marker, code]);
                output.AddRange(jpeg.Slice(position, length));
            }
            position += length;

            if (code == StartOfScan)
            {
                sawScan = true;
                var dataStart = position;
                position = EndOfScanData(jpeg, position);
                output.AddRange(jpeg[dataStart..position]);
            }
        }
        return null;
    }

    // Compressed data runs until a marker that isn't a stuffed FF00 or a restart marker (FFD0–FFD7).
    private static int EndOfScanData(ReadOnlySpan<byte> jpeg, int position)
    {
        while (position + 1 < jpeg.Length)
        {
            if (jpeg[position] == Marker && jpeg[position + 1] is not (0x00 or (>= 0xD0 and <= 0xD7))) return position;
            position++;
        }
        return jpeg.Length;
    }
}
