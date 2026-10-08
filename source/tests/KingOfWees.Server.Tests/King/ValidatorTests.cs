using FluentValidation.TestHelper;
using KingOfWees.Server.King;

namespace KingOfWees.Server.Tests.King;

// Each request validator, rule by rule, independent of HTTP.
public sealed class ValidatorTests
{
    private static readonly string TooLongName = new('n', 41);
    private static readonly string TooLongKey = new('k', 65);

    private readonly LogFeedingRequestValidator _feeding = new();
    private readonly LogSightingRequestValidator _sighting = new();

    [Theory]
    [InlineData("", "reporterKey.required")]
    [InlineData(null, "reporterKey.required")]
    [InlineData("k", null)]
    public void Feeding_reporter_key(string? key, string? expectedCode) =>
        AssertCode(_feeding.TestValidate(new LogFeedingRequest(key!, null, [])), r => r.ReporterKey, expectedCode);

    [Theory]
    [InlineData("", "reporterKey.required")]
    [InlineData(null, "reporterKey.required")]
    [InlineData("k", null)]
    public void Sighting_reporter_key(string? key, string? expectedCode) =>
        AssertCode(_sighting.TestValidate(new LogSightingRequest(key!, null)), r => r.ReporterKey, expectedCode);

    [Fact]
    public void Reporter_key_longer_than_64_is_rejected_for_both_kinds()
    {
        _feeding.TestValidate(new LogFeedingRequest(TooLongKey, null, []))
            .ShouldHaveValidationErrorFor(r => r.ReporterKey).WithErrorCode("reporterKey.tooLong");
        _sighting.TestValidate(new LogSightingRequest(TooLongKey, null))
            .ShouldHaveValidationErrorFor(r => r.ReporterKey).WithErrorCode("reporterKey.tooLong");
    }

    [Fact]
    public void Reporter_name_longer_than_40_is_rejected_for_both_kinds()
    {
        _feeding.TestValidate(new LogFeedingRequest("k", TooLongName, []))
            .ShouldHaveValidationErrorFor(r => r.ReporterName).WithErrorCode("reporterName.tooLong");
        _sighting.TestValidate(new LogSightingRequest("k", TooLongName))
            .ShouldHaveValidationErrorFor(r => r.ReporterName).WithErrorCode("reporterName.tooLong");
    }

    [Fact]
    public void Reporter_name_of_exactly_40_and_absent_are_accepted()
    {
        _feeding.TestValidate(new LogFeedingRequest("k", new string('n', 40), [])).ShouldNotHaveAnyValidationErrors();
        _sighting.TestValidate(new LogSightingRequest("k", null)).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Food_outside_the_enum_is_rejected()
    {
        var result = _feeding.TestValidate(new LogFeedingRequest("k", null, [Food.Wet, (Food)7]));

        Assert.Contains("food.invalid", result.Errors.Select(e => e.ErrorCode));
    }

    [Fact]
    public void The_same_food_twice_is_rejected()
    {
        var result = _feeding.TestValidate(new LogFeedingRequest("k", null, [Food.Dry, Food.Dry]));

        Assert.Contains("foods.duplicate", result.Errors.Select(e => e.ErrorCode));
    }

    [Fact]
    public void Any_combination_of_known_foods_or_none_or_omitted_is_accepted()
    {
        _feeding.TestValidate(new LogFeedingRequest("k", null, [Food.Wet, Food.Dry, Food.Treats])).ShouldNotHaveAnyValidationErrors();
        _feeding.TestValidate(new LogFeedingRequest("k", null, [])).ShouldNotHaveAnyValidationErrors();
        _feeding.TestValidate(new LogFeedingRequest("k", null, null)).ShouldNotHaveAnyValidationErrors();
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
