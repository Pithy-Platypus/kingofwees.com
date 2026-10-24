using System.Diagnostics;
using OpenTelemetry;

namespace KingOfWees.Server.Telemetry;

// Leaves out the spans that would spend the workspace's daily cap and tell nothing: the readiness probe's database ping
// (a child of the /health request the instrumentation's filter already leaves out) and unknown /api paths (scanners).
// Every real route's row stays, 404s and 5xx included — the alerts count them. Dropped here, never by a sampler: a
// sampler would lose a post's row too, and with it its email. Why → docs/patterns/telemetry.md.
public sealed class NoiseFilter : BaseProcessor<Activity>
{
    public const string UnknownApiRoute = "/api/{**rest}";

    public override void OnEnd(Activity activity)
    {
        if (ChildOfUntracedRequest(activity) || UnknownApiPath(activity))
        {
            // Every export processor skips a span that isn't recorded.
            activity.ActivityTraceFlags &= ~ActivityTraceFlags.Recorded;
        }
    }

    // The request filter leaves a request out by turning its data off; its children (the health check's ping) still
    // record, since the exporter's sampler doesn't ask the parent.
    private static bool ChildOfUntracedRequest(Activity activity) => activity.Parent is { IsAllDataRequested: false };

    private static bool UnknownApiPath(Activity activity) =>
        activity.Kind == ActivityKind.Server && activity.GetTagItem("http.route") is UnknownApiRoute;
}
