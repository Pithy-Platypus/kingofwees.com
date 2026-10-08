using System.Text.Json;
using FluentValidation;

namespace KingOfWees.Server.Validation;

// Validates every handler argument that has a registered IValidator<T>; answers 400 with error codes keyed by camelCase field.
public sealed class ValidationFilter : IEndpointFilter
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
                return TypedResults.ValidationProblem(result.Errors
                    .GroupBy(e => JsonNamingPolicy.CamelCase.ConvertName(e.PropertyName))
                    .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorCode).ToArray()));
            }
        }

        return await next(context);
    }
}
