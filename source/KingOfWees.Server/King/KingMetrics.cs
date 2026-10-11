using System.Diagnostics.Metrics;

namespace KingOfWees.Server.King;

public sealed class KingMetrics
{
    public const string MeterName = "KingOfWees";

    private readonly Counter<long> _feedings;
    private readonly Counter<long> _sightings;
    private readonly Counter<long> _hides;
    private readonly Counter<long> _restores;
    private readonly Counter<long> _renames;
    private readonly Counter<long> _merges;
    private readonly Counter<long> _postingRefused;
    private readonly Counter<long> _photos;

    public KingMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _feedings = meter.CreateCounter<long>("king.feedings", "{feeding}", "Feedings logged");
        _sightings = meter.CreateCounter<long>("king.sightings", "{sighting}", "Sightings logged");
        _hides = meter.CreateCounter<long>("king.admin.hides", "{hide}", "Entries or devices hidden by an admin");
        _restores = meter.CreateCounter<long>("king.admin.restores", "{restore}", "Entries or devices shown again by an admin");
        _renames = meter.CreateCounter<long>("king.admin.renames", "{rename}", "Places renamed by an admin");
        _merges = meter.CreateCounter<long>("king.admin.merges", "{merge}", "Places merged by an admin");
        _postingRefused = meter.CreateCounter<long>("king.posting.refused", "{request}", "Writes refused from outside the US");
        _photos = meter.CreateCounter<long>("king.photos", "{photo}", "Photos posted");
    }

    public void FeedingLogged() => _feedings.Add(1);

    public void SightingLogged() => _sightings.Add(1);

    /// <param name="kind">"sighting", "feeding" or "shared" — never anything identifying.</param>
    public void PhotoPosted(string kind) => _photos.Add(1, new KeyValuePair<string, object?>("kind", kind));

    /// <param name="target">"entry" or "device" — never anything identifying.</param>
    public void Hidden(string target) => _hides.Add(1, new KeyValuePair<string, object?>("target", target));

    /// <param name="target">"entry" or "device" — never anything identifying.</param>
    public void Restored(string target) => _restores.Add(1, new KeyValuePair<string, object?>("target", target));

    /// <param name="target">"spot" — never anything identifying.</param>
    public void Renamed(string target) => _renames.Add(1, new KeyValuePair<string, object?>("target", target));

    /// <param name="target">"spot" — never anything identifying.</param>
    public void Merged(string target) => _merges.Add(1, new KeyValuePair<string, object?>("target", target));

    /// <summary>No tags: never the country or the address.</summary>
    public void PostingRefused() => _postingRefused.Add(1);
}
