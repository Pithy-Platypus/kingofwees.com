using System.Text;
using KingOfWees.Server.Photos;

namespace KingOfWees.Server.Tests.Photos;

public sealed class JpegMetadataTests
{
    private static readonly byte[] Soi = [0xFF, 0xD8];
    private static readonly byte[] Eoi = [0xFF, 0xD9];

    // A marker segment: FF, code, then a big-endian length that counts itself.
    private static byte[] Segment(byte code, string payload) => Segment(code, Encoding.ASCII.GetBytes(payload));

    private static byte[] Segment(byte code, byte[] payload) =>
        [0xFF, code, (byte)((payload.Length + 2) >> 8), (byte)(payload.Length + 2), .. payload];

    private static readonly byte[] Jfif = Segment(0xE0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
    private static readonly byte[] Exif = Segment(0xE1, "Exif\0\0GPS 45.523456 -122.677123");
    private static readonly byte[] Xmp = Segment(0xE1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta GPSLatitude=45.523/>");
    private static readonly byte[] Icc = Segment(0xE2, "ICC_PROFILE\0\x01\x01profile");
    private static readonly byte[] Comment = Segment(0xFE, "taken on Guy St.");
    private static readonly byte[] Tables = Segment(0xDB, "\0quantization table");
    private static readonly byte[] Frame = Segment(0xC0, "\x08\0\x10\0\x10\x01\x01\x11\0");
    private static readonly byte[] Huffman = Segment(0xC4, "\0huffman table");
    private static readonly byte[] Scan = Segment(0xDA, "\x01\x01\0\0\x3F\0");

    // Entropy-coded data: a stuffed FF00 and a restart marker are part of it, not segments.
    private static readonly byte[] ScanData = [0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD0, 0x56, 0xFF, 0x00];

    [Fact]
    public void Drops_exif_xmp_other_app_segments_and_comments_and_keeps_the_image_byte_for_byte()
    {
        byte[] withMetadata = [.. Soi, .. Jfif, .. Exif, .. Xmp, .. Icc, .. Comment, .. Tables, .. Frame, .. Huffman, .. Scan, .. ScanData, .. Eoi];

        byte[] withoutMetadata = [.. Soi, .. Jfif, .. Tables, .. Frame, .. Huffman, .. Scan, .. ScanData, .. Eoi];

        Assert.Equal(withoutMetadata, JpegMetadata.Strip(withMetadata));
    }

    [Fact]
    public void Metadata_between_the_scans_of_a_progressive_jpeg_is_dropped_too()
    {
        byte[] progressive = [.. Soi, .. Tables, .. Frame, .. Huffman, .. Scan, .. ScanData, .. Comment, .. Exif, .. Huffman, .. Scan, .. ScanData, .. Eoi];

        byte[] withoutMetadata = [.. Soi, .. Tables, .. Frame, .. Huffman, .. Scan, .. ScanData, .. Huffman, .. Scan, .. ScanData, .. Eoi];

        Assert.Equal(withoutMetadata, JpegMetadata.Strip(progressive));
    }

    [Fact]
    public void Anything_after_the_end_of_the_image_is_dropped()
    {
        byte[] trailing = [.. Soi, .. Frame, .. Scan, .. ScanData, .. Eoi, .. Encoding.ASCII.GetBytes("appended GPS 45.523456")];

        byte[] image = [.. Soi, .. Frame, .. Scan, .. ScanData, .. Eoi];

        Assert.Equal(image, JpegMetadata.Strip(trailing));
    }

    [Fact]
    public void A_jpeg_without_metadata_comes_back_unchanged()
    {
        byte[] plain = [.. Soi, .. Jfif, .. Tables, .. Frame, .. Huffman, .. Scan, .. ScanData, .. Eoi];

        Assert.Equal(plain, JpegMetadata.Strip(plain));
    }

    [Fact]
    public void A_real_photo_keeps_every_byte_and_loses_an_exif_block_put_into_it()
    {
        var photo = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "TestData", "king-licking.jpg"));
        byte[] withExif = [.. photo[..2], .. Exif, .. photo[2..]];

        Assert.Equal(photo, JpegMetadata.Strip(photo));
        Assert.Equal(photo, JpegMetadata.Strip(withExif));
    }

    [Theory]
    [InlineData("png")]
    [InlineData("empty")]
    [InlineData("truncated segment")]
    [InlineData("zero length")]
    [InlineData("no scan")]
    [InlineData("no end")]
    [InlineData("junk between segments")]
    public void Anything_that_is_not_a_whole_jpeg_is_refused(string shape)
    {
        byte[] input = shape switch
        {
            "png" => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
            "empty" => [],
            "truncated segment" => [.. Soi, .. Frame[..6]],
            "zero length" => [.. Soi, 0xFF, 0xDB, 0x00, 0x00, .. Frame, .. Scan, .. ScanData, .. Eoi],
            "no scan" => [.. Soi, .. Tables, .. Frame, .. Eoi],
            "no end" => [.. Soi, .. Frame, .. Scan, .. ScanData],
            "junk between segments" => [.. Soi, .. Tables, 0x00, .. Frame, .. Scan, .. ScanData, .. Eoi],
            _ => throw new ArgumentOutOfRangeException(nameof(shape)),
        };

        Assert.Null(JpegMetadata.Strip(input));
    }
}
