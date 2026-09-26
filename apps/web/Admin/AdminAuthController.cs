using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Web.Admin;

[Route("api/admin")]
[ServiceFilter(typeof(AdminCacheFilter))]
public sealed class AdminAuthController(AdminSessionService sessions) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login()
    {
        if (!AdminApi.RequireCsrf(HttpContext))
            return StatusCode(StatusCodes.Status403Forbidden,
                new
                {
                    error = "Invalid CSRF token."
                });

        if (!Request.HasJsonContentType())
            return BadRequest(new
            {
                error = "Expected application/json."
            });

        JsonElement input;
        try
        {
            input = await Request.ReadFromJsonAsync<JsonElement>();
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return BadRequest(new
            {
                error = "Invalid JSON."
            });
        }

        var validation = new AdminValidation(input);
        var email = validation.Text("email", 3, 320).ToLowerInvariant();
        var password = validation.RawText("password", 8, 200);
        if (validation.Errors.Count > 0)
            return InvalidCredentials(validation.Errors);
        if (!System.Net.Mail.MailAddress.TryCreate(email, out var address)
            || address.Address != email)
            return InvalidCredentials(new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["email"] = "Enter a valid email address."
            });

        var user = await sessions.VerifyCredentialsAsync(email, password);
        if (user is null)
            return Unauthorized(new
            {
                ok = false,
                message = "Email or password is incorrect."
            });

        await sessions.SignInAsync(HttpContext, user);
        return Ok(new
        {
            ok = true,
            user = new
            {
                user.Id,
                user.Email,
                user.Name
            }
        });
    }

    [HttpPost("logout")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> Logout()
    {
        await sessions.SignOutAsync(HttpContext);
        AdminApi.DeleteCsrfCookie(HttpContext);
        return Ok(new
        {
            ok = true
        });
    }

    [HttpGet("me")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> Me()
    {
        var user = (await sessions.CurrentUserAsync(HttpContext))!;
        return Ok(new
        {
            user.Id,
            user.Email,
            user.Name
        });
    }

    private IActionResult InvalidCredentials(IReadOnlyDictionary<string, string> errors) =>
        new JsonResult(new
        {
            type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
            title = "One or more validation errors occurred.",
            status = StatusCodes.Status400BadRequest,
            errors = errors.ToDictionary(
                pair => pair.Key, pair => new[] { pair.Value }, StringComparer.Ordinal)
        })
        {
            StatusCode = StatusCodes.Status400BadRequest
        };
}
