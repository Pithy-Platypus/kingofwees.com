using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KingOfWees.Server.Tests.Api;

// The blob client's token refreshes logged ~0.4 MB a day at Information (2026-10-25), nearly all of AppTraces; a failed
// refresh logs at Warning or above anyway.
public sealed class LoggingConfigurationTests
{
    [Theory]
    [InlineData("Azure.Core")]
    [InlineData("Azure.Identity")]
    public async Task Azure_sdk_chatter_is_kept_from_warning_up(string category)
    {
        await using var factory = new KingApiFactory();

        var rules = factory.Services.GetRequiredService<IOptionsMonitor<LoggerFilterOptions>>().CurrentValue.Rules;

        Assert.Contains(rules, r => r.CategoryName == category && r.LogLevel == LogLevel.Warning && r.ProviderName is null);
    }
}
