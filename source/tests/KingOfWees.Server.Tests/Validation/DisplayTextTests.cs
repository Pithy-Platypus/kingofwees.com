using KingOfWees.Server.Validation;

namespace KingOfWees.Server.Tests.Validation;

// Names everyone sees: nothing invisible or direction-reversing survives, while emoji and scripts that need joiners do.
// Escapes only: the characters themselves would be invisible here too.
public sealed class DisplayTextTests
{
    [Theory]
    [InlineData("\u202EKing", "King")] // right-to-left override: would show the rest backwards
    [InlineData("\u2066Porch\u2069", "Porch")] // isolates
    [InlineData("\u200ESarah\u200F", "Sarah")] // direction marks
    [InlineData("Sa\u200Brah", "Sarah")] // zero-width space
    [InlineData("\uFEFFPorch", "Porch")] // byte-order mark
    [InlineData("Por\u00ADch", "Porch")] // soft hyphen
    [InlineData("Porch\U000E0041\U000E0042", "Porch")] // tag characters: invisible text
    [InlineData("Por\tch\n", "Porch")]
    [InlineData("\u0000Porch\u007F", "Porch")]
    [InlineData("Front\u2028porch\u2029", "Frontporch")] // line and paragraph separators
    [InlineData("  Sarah  ", "Sarah")]
    public void Removes_invisible_and_direction_characters_and_trims(string typed, string shown) =>
        Assert.Equal(shown, DisplayText.Clean(typed));

    [Theory]
    [InlineData("\U0001F468\u200D\U0001F469\u200D\U0001F467")] // a family emoji is joined by ZWJ
    [InlineData("\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645")] // Persian keeps its ZWNJ
    [InlineData("Zo\u00EB")]
    [InlineData("Mrs Wee")]
    [InlineData("\u2764\uFE0F")] // a variation selector is a mark, not a format character
    [InlineData("\U0001F1FA\U0001F1F8")] // a flag is two regional indicators
    public void Keeps_what_people_mean_to_type(string typed) => Assert.Equal(typed, DisplayText.Clean(typed));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\u200B\u200B")]
    public void Nothing_visible_is_no_text(string? typed) => Assert.Null(DisplayText.Clean(typed));
}
