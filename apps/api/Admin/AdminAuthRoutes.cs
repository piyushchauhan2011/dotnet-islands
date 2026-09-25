using System.Security.Claims;
using System.Text.Json;
using Hotel.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

internal static class AdminAuthRoutes
{
    private const string AuthScheme = CookieAuthenticationDefaults.AuthenticationScheme;

    internal static void MapAuth(RouteGroupBuilder admin)
    {
        MapLogin(admin);
        MapSession(admin);
    }
    private static void MapLogin(RouteGroupBuilder admin) =>
        admin.MapPost("/login", Login);

    private static async Task<IResult> Login(HttpContext context, HotelDbContext db)
    {
        if (AdminApi.MutationError(context) is { } error)
            return error;
        var (email, password, inputError) = await ReadCredentials(context);
        if (inputError is not null)
            return inputError;
        var user = await db.AdminUsers.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Email == email);
        if (user is null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            return Results.Json(new
            {
                ok = false,
                message = "Email or password is incorrect."
            }, statusCode: 401);
        await SignIn(context, user);
        context.Response.Headers.CacheControl = "private, no-store";
        return Results.Ok(new
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

    private static async Task<(string Email, string Password, IResult? Error)>
        ReadCredentials(HttpContext context)
    {
        if (!context.Request.HasJsonContentType())
            return ("", "", Results.BadRequest(new
            {
                error = "Expected application/json."
            }));
        JsonElement input;
        try
        {
            input = await context.Request.ReadFromJsonAsync<JsonElement>();
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return ("", "", Results.BadRequest(new
            {
                error = "Invalid JSON."
            }));
        }
        var validation = new AdminValidation(input);
        var email = validation.Text("email", 3, 320).ToLowerInvariant();
        var password = validation.RawText("password", 8, 200);
        if (validation.Errors.Count > 0)
            return (email, password, AdminApi.ValidationError(validation.Errors));
        if (!System.Net.Mail.MailAddress.TryCreate(email, out var address)
            || address.Address != email)
            return (email, password, AdminApi.ValidationError(
                new Dictionary<string, string>
                {
                    ["email"] = "Enter a valid email address."
                }));
        return (email, password, null);
    }

    private static Task SignIn(HttpContext context, AdminUser user) =>
        context.SignInAsync(AuthScheme,
            new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, user.Id)], AuthScheme)),
            new AuthenticationProperties
            {
                IsPersistent = false,
                ExpiresUtc = DateTimeOffset.UtcNow.AddHours(12),
                AllowRefresh = false
            });

    private static void MapSession(RouteGroupBuilder admin)
    {
        admin.MapPost("/logout", async (HttpContext context, HotelDbContext db) =>
        {
            if (await AdminApi.AuthError(context, db) is { } unauthorized)
                return unauthorized;
            if (AdminApi.MutationError(context) is { } error)
                return error;
            await context.SignOutAsync(AuthScheme);
            AdminApi.DeleteCsrfCookie(context);
            return Results.Ok(new
            {
                ok = true
            });
        });
        admin.MapGet("/me", async (HttpContext context, HotelDbContext db) =>
        {
            context.Response.Headers.CacheControl = "private, no-store";
            var user = await AdminApi.CurrentUser(context, db);
            return user is null ? Results.Unauthorized() : Results.Ok(new
            {
                user.Id,
                user.Email,
                user.Name
            });
        });
    }
}
