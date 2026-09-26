using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Hotel.Web.Admin;

public sealed class AdminCacheFilter : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context, ActionExecutionDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "private, no-store";
        await next();
    }
}

public sealed class AdminRequestFilter(AdminSessionService sessions) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (await sessions.CurrentUserAsync(context.HttpContext) is null)
        {
            context.Result = new UnauthorizedResult();
            return;
        }
        if (HttpMethods.IsPost(context.HttpContext.Request.Method)
            && !AdminApi.RequireCsrf(context.HttpContext))
        {
            context.Result = new ObjectResult(new
            {
                error = "Invalid CSRF token."
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }
        await next();
    }
}
