namespace KingOfWees.Server.King;

/// <summary>A BSON UTC date comes back from the driver as a <see cref="DateTime"/> of unspecified kind; this makes it the instant it was.</summary>
internal static class BsonTime
{
    public static DateTimeOffset Utc(DateTime stored) => new(DateTime.SpecifyKind(stored, DateTimeKind.Utc));
}
