using System.Diagnostics;
using OpenTelemetry;

namespace KingOfWees.Server.Telemetry;

// Removes visitor-identifying tags from every span before any exporter sees it; the privacy page relies on this.
public sealed class PersonalDataScrubber : BaseProcessor<Activity>
{
    private static readonly string[] PersonalTags = ["client.address", "client.port", "user_agent.original", "url.query"];

    public override void OnEnd(Activity activity)
    {
        foreach (var tag in PersonalTags)
        {
            activity.SetTag(tag, null);
        }
    }
}
