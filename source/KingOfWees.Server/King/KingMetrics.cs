using System.Diagnostics.Metrics;

namespace KingOfWees.Server.King;

public sealed class KingMetrics
{
    public const string MeterName = "KingOfWees";

    private readonly Counter<long> _feedings;
    private readonly Counter<long> _sightings;
    private readonly Counter<long> _hides;
    private readonly Counter<long> _restores;

    public KingMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _feedings = meter.CreateCounter<long>("king.feedings", "{feeding}", "Feedings logged");
        _sightings = meter.CreateCounter<long>("king.sightings", "{sighting}", "Sightings logged");
        _hides = meter.CreateCounter<long>("king.admin.hides", "{hide}", "Entries or devices hidden by an admin");
        _restores = meter.CreateCounter<long>("king.admin.restores", "{restore}", "Entries or devices shown again by an admin");
    }

    public void FeedingLogged() => _feedings.Add(1);

    public void SightingLogged() => _sightings.Add(1);

    /// <param name="target">"entry" or "device" — never anything identifying.</param>
    public void Hidden(string target) => _hides.Add(1, new KeyValuePair<string, object?>("target", target));

    /// <param name="target">"entry" or "device" — never anything identifying.</param>
    public void Restored(string target) => _restores.Add(1, new KeyValuePair<string, object?>("target", target));
}
