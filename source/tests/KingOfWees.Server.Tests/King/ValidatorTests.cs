using FluentValidation.TestHelper;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Each request validator, rule by rule, independent of HTTP.
public sealed class ValidatorTests
{
    private static readonly string TooLongName = new('n', 41);
    private static readonly string TooLongKey = new('k', 65);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly GeoPoint Porch = new(45.523, -122.677);

    private readonly InMemorySpotStore _spots = new();
    private readonly LogFeedingRequestValidator _feeding;
    private readonly LogSightingRequestValidator _sighting = new();
    private readonly AddSpotRequestValidator _spot = new();

    public ValidatorTests() => _feeding = new LogFeedingRequestValidator(_spots);

    [Theory]
    [InlineData("", "reporterKey.required")]
    [InlineData(null, "reporterKey.required")]
    [InlineData("k", null)]
    public async Task Feeding_reporter_key(string? key, string? expectedCode) =>
        AssertCode(await _feeding.TestValidateAsync(new LogFeedingRequest(key!, null, []), cancellationToken: Ct), r => r.ReporterKey, expectedCode);

    [Theory]
    [InlineData("", "reporterKey.required")]
    [InlineData(null, "reporterKey.required")]
    [InlineData("k", null)]
    public void Sighting_reporter_key(string? key, string? expectedCode) =>
        AssertCode(_sighting.TestValidate(new LogSightingRequest(key!, null)), r => r.ReporterKey, expectedCode);

    [Fact]
    public async Task Reporter_key_longer_than_64_is_rejected_for_both_kinds()
    {
        (await _feeding.TestValidateAsync(new LogFeedingRequest(TooLongKey, null, []), cancellationToken: Ct))
            .ShouldHaveValidationErrorFor(r => r.ReporterKey).WithErrorCode("reporterKey.tooLong");
        _sighting.TestValidate(new LogSightingRequest(TooLongKey, null))
            .ShouldHaveValidationErrorFor(r => r.ReporterKey).WithErrorCode("reporterKey.tooLong");
    }

    [Fact]
    public async Task Reporter_name_longer_than_40_is_rejected_for_both_kinds()
    {
        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", TooLongName, []), cancellationToken: Ct))
            .ShouldHaveValidationErrorFor(r => r.ReporterName).WithErrorCode("reporterName.tooLong");
        _sighting.TestValidate(new LogSightingRequest("k", TooLongName))
            .ShouldHaveValidationErrorFor(r => r.ReporterName).WithErrorCode("reporterName.tooLong");
    }

    [Fact]
    public async Task Reporter_name_of_exactly_40_and_absent_are_accepted()
    {
        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", new string('n', 40), []), cancellationToken: Ct)).ShouldNotHaveAnyValidationErrors();
        _sighting.TestValidate(new LogSightingRequest("k", null)).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public async Task Food_outside_the_enum_is_rejected()
    {
        var result = await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, [Food.Wet, (Food)7]), cancellationToken: Ct);

        Assert.Contains("food.invalid", result.Errors.Select(e => e.ErrorCode));
    }

    [Fact]
    public async Task The_same_food_twice_is_rejected()
    {
        var result = await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, [Food.Dry, Food.Dry]), cancellationToken: Ct);

        Assert.Contains("foods.duplicate", result.Errors.Select(e => e.ErrorCode));
    }

    [Fact]
    public async Task Any_combination_of_known_foods_or_none_or_omitted_is_accepted()
    {
        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, [Food.Wet, Food.Dry, Food.Treats]), cancellationToken: Ct)).ShouldNotHaveAnyValidationErrors();
        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, []), cancellationToken: Ct)).ShouldNotHaveAnyValidationErrors();
        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, null), cancellationToken: Ct)).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public async Task A_feeding_at_a_spot_nobody_added_is_rejected()
    {
        var result = await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, [], SpotId: "no-such-spot"), cancellationToken: Ct);

        result.ShouldHaveValidationErrorFor(r => r.SpotId).WithErrorCode("spotId.unknown");
    }

    [Fact]
    public async Task A_feeding_at_a_known_spot_or_at_no_spot_is_accepted()
    {
        await _spots.AddAsync(new Spot("porch-1", "Blue house steps", Porch, DateTimeOffset.UnixEpoch, "k"), Ct);

        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, [], SpotId: "porch-1"), cancellationToken: Ct)).ShouldNotHaveAnyValidationErrors();
        (await _feeding.TestValidateAsync(new LogFeedingRequest("k", null, [], SpotId: null), cancellationToken: Ct)).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData(null, "name.required")]
    [InlineData("", "name.required")]
    [InlineData("   ", "name.required")]
    [InlineData("12345678901234567890123456789012345678901", "name.tooLong")]
    [InlineData("1234567890123456789012345678901234567890", null)]
    public void Spot_name(string? name, string? expectedCode) =>
        AssertCode(_spot.TestValidate(new AddSpotRequest("k", name!, Porch)), r => r.Name, expectedCode);

    [Fact]
    public void A_spot_needs_a_location()
    {
        _spot.TestValidate(new AddSpotRequest("k", "Corner", null))
            .ShouldHaveValidationErrorFor(r => r.Location).WithErrorCode("location.required");
    }

    [Theory]
    [InlineData(90.1, 0)]
    [InlineData(-90.1, 0)]
    [InlineData(0, 180.1)]
    [InlineData(0, -180.1)]
    public void A_location_off_the_globe_is_rejected(double latitude, double longitude)
    {
        _spot.TestValidate(new AddSpotRequest("k", "Corner", new GeoPoint(latitude, longitude)))
            .ShouldHaveValidationErrorFor(r => r.Location).WithErrorCode("location.outOfRange");
    }

    [Theory]
    [InlineData(90, 180)]
    [InlineData(-90, -180)]
    public void A_location_at_the_edge_of_the_globe_is_accepted(double latitude, double longitude)
    {
        _spot.TestValidate(new AddSpotRequest("k", "Corner", new GeoPoint(latitude, longitude))).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void A_sighting_may_say_where_he_was_or_not()
    {
        _sighting.TestValidate(new LogSightingRequest("k", null, Porch)).ShouldNotHaveAnyValidationErrors();
        _sighting.TestValidate(new LogSightingRequest("k", null, null)).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void A_sighting_off_the_globe_is_rejected()
    {
        _sighting.TestValidate(new LogSightingRequest("k", null, new GeoPoint(91, 0)))
            .ShouldHaveValidationErrorFor(r => r.Location).WithErrorCode("location.outOfRange");
    }

    [Fact]
    public void A_spot_needs_a_reporter_key()
    {
        _spot.TestValidate(new AddSpotRequest("", "Corner", Porch))
            .ShouldHaveValidationErrorFor(r => r.ReporterKey).WithErrorCode("reporterKey.required");
    }

    private static void AssertCode<T>(TestValidationResult<T> result, System.Linq.Expressions.Expression<Func<T, string>> field, string? code)
    {
        if (code is null)
        {
            result.ShouldNotHaveValidationErrorFor(field);
        }
        else
        {
            result.ShouldHaveValidationErrorFor(field).WithErrorCode(code);
        }
    }
}
