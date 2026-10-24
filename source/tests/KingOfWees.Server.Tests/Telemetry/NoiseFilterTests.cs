using System.Diagnostics;
using KingOfWees.Server.Telemetry;

namespace KingOfWees.Server.Tests.Telemetry;

// The readiness probe's database ping was 43% of a day's telemetry (8,641 rows, 2026-10-23): a child of the /health
// request the instrumentation leaves out, recorded all the same because the exporter's sampler ignores the parent.
public sealed class NoiseFilterTests : IDisposable
{
    private readonly ActivitySource _source = new(nameof(NoiseFilterTests));
    private readonly ActivityListener _listener;

    public NoiseFilterTests()
    {
        _listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == nameof(NoiseFilterTests),
            // What the Azure Monitor exporter's sampler does at SamplingRatio 1: record everything, parent or not.
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(_listener);
    }

    [Fact]
    public void A_child_of_a_request_the_filter_left_out_is_not_recorded()
    {
        using var request = _source.StartActivity("GET /health", ActivityKind.Server)!;
        request.IsAllDataRequested = false; // how the instrumentation's Filter leaves a request out
        using var ping = _source.StartActivity("ping", ActivityKind.Client)!;
        Assert.True(ping.Recorded);

        new NoiseFilter().OnEnd(ping);

        Assert.False(ping.Recorded);
    }

    [Fact]
    public void A_child_of_a_traced_request_stays_recorded()
    {
        using var request = _source.StartActivity("GET /api/king/status", ActivityKind.Server)!;
        using var find = _source.StartActivity("find events", ActivityKind.Client)!;

        new NoiseFilter().OnEnd(find);

        Assert.True(find.Recorded);
    }

    [Theory]
    [InlineData(NoiseFilter.UnknownApiRoute, false)]
    [InlineData("/api/king/photos/{id}/thumb", true)]
    public void Only_a_request_for_an_unknown_api_path_is_dropped_by_its_route(string route, bool recorded)
    {
        using var request = _source.StartActivity("GET", ActivityKind.Server)!;
        request.SetTag("http.route", route);
        request.SetTag("http.response.status_code", 404); // a 404 on a real route (an unknown photo) is kept

        new NoiseFilter().OnEnd(request);

        Assert.Equal(recorded, request.Recorded);
    }

    [Fact]
    public void A_root_span_without_a_route_is_kept()
    {
        // A log or a background span: nothing says it's noise.
        using var work = _source.StartActivity("warm up", ActivityKind.Internal)!;

        new NoiseFilter().OnEnd(work);

        Assert.True(work.Recorded);
    }

    public void Dispose()
    {
        _listener.Dispose();
        _source.Dispose();
    }
}
