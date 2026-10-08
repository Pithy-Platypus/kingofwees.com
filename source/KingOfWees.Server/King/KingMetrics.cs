using System.Diagnostics.Metrics;

namespace KingOfWees.Server.King;

public sealed class KingMetrics
{
    public const string MeterName = "KingOfWees";

    private readonly Counter<long> _feedings;
    private readonly Counter<long> _sightings;

    public KingMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _feedings = meter.CreateCounter<long>("king.feedings", "{feeding}", "Feedings logged");
        _sightings = meter.CreateCounter<long>("king.sightings", "{sighting}", "Sightings logged");
    }

    public void FeedingLogged() => _feedings.Add(1);

    public void SightingLogged() => _sightings.Add(1);
}
