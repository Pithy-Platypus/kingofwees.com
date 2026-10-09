namespace KingOfWees.Server.King;

// A device hidden by an admin (spam): its entries and spots leave every public read, including ones it posts later.
// Id is what admins see and restore by; ReporterKey is never returned by the API.
public sealed record HiddenReporter(string Id, string ReporterKey, DateTimeOffset HiddenAt);

public interface IHiddenReporterStore
{
    /// <returns>The device's record; hiding an already-hidden device returns its existing record unchanged.</returns>
    Task<HiddenReporter> HideAsync(string reporterKey, DateTimeOffset hiddenAt, CancellationToken cancellationToken);

    /// <returns>True when a record was removed (the device is visible again).</returns>
    Task<bool> RestoreAsync(string id, CancellationToken cancellationToken);

    /// <summary>Newest hidden first.</summary>
    Task<IReadOnlyList<HiddenReporter>> ListAsync(CancellationToken cancellationToken);
}
