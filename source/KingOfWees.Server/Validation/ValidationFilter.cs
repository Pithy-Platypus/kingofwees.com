using System.Text.Json;
using FluentValidation;

namespace KingOfWees.Server.Validation;

// Validates every handler argument that has a registered IValidator<T>; answers 400 with error codes keyed by camelCase field,
// and logs the route and codes once — never what was sent (a nickname, a note): the privacy tests hold logs to that.
public sealed partial class ValidationFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        foreach (var argument in context.Arguments)
        {
            if (argument is null) continue;

            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());
            if (context.HttpContext.RequestServices.GetService(validatorType) is not IValidator validator) continue;

            var result = await validator.ValidateAsync(
                new ValidationContext<object>(argument), context.HttpContext.RequestAborted);
            if (!result.IsValid)
            {
                var codes = result.Errors
                    .GroupBy(e => JsonNamingPolicy.CamelCase.ConvertName(e.PropertyName))
                    .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorCode).ToArray());
                var http = context.HttpContext;
                Refused(http.RequestServices.GetRequiredService<ILogger<ValidationFilter>>(),
                    $"{http.Request.Method} {(http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? http.Request.Path.Value}",
                    string.Join("; ", codes.Select(c => $"{c.Key}: {string.Join(", ", c.Value)}")));
                return TypedResults.ValidationProblem(codes);
            }
        }

        return await next(context);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Refused {Route}: {Codes}")]
    private static partial void Refused(ILogger logger, string route, string codes);
}
