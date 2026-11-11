using System.Linq.Expressions;
using FluentValidation;
using MongoDB.Driver;

namespace KingOfWees.Server.King;

/// <summary>Cursor paging, the same on every list — history, photos, the admin's activity: newest first, by time then id.</summary>
public static class Paging
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 100;

    /// <summary>
    /// The page out of what was fetched — one more than <paramref name="limit"/>, which tells whether an older page exists
    /// without a second query — and the cursor for that older page, or null on the last.
    /// </summary>
    public static (List<T> Items, string? Next) Page<T>(IReadOnlyList<T> fetched, int limit, Func<T, string> id)
    {
        var items = fetched.Take(limit).ToList();
        return (items, fetched.Count > limit ? id(items[^1]) : null);
    }

    /// <summary>Mongo: the documents older than the cursor, by time then by id, matching the descending sort.</summary>
    public static FilterDefinition<TDocument> OlderThan<TDocument>(
        Expression<Func<TDocument, DateTime>> time, Expression<Func<TDocument, string>> id, DateTime beforeTime, string beforeId)
    {
        var filter = Builders<TDocument>.Filter;
        return filter.Lt(time, beforeTime) | (filter.Eq(time, beforeTime) & filter.Lt(id, beforeId));
    }
}

internal static class PagingRules
{
    public static IRuleBuilderOptions<T, int?> ValidLimit<T>(this IRuleBuilder<T, int?> rule) =>
        rule.InclusiveBetween(1, Paging.MaxLimit).WithErrorCode("limit.outOfRange");

    /// <summary>The cursor, when given, names a record <paramref name="find"/> knows — hidden or not: it came from a page.</summary>
    public static IRuleBuilderOptions<T, string?> KnownCursor<T, TRecord>(
        this IRuleBuilder<T, string?> rule, Func<string, CancellationToken, Task<TRecord?>> find) where TRecord : class =>
        rule.MustAsync(async (id, ct) => id is null || await find(id, ct) is not null).WithErrorCode("before.unknown");
}
