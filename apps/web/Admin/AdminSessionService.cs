using System.Security.Claims;
using Hotel.Web.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Admin;

public sealed class AdminSessionService(HotelDbContext db)
{
    private const string AuthScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    private AdminUser? _currentUser;
    private bool _currentUserLoaded;

    public async Task<AdminUser?> VerifyCredentialsAsync(string email, string password)
    {
        var user = await db.AdminUsers.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Email == email);
        return user is not null && BCrypt.Net.BCrypt.Verify(password, user.PasswordHash)
            ? user : null;
    }

    public async Task<AdminUser?> CurrentUserAsync(HttpContext context)
    {
        if (!_currentUserLoaded)
        {
            _currentUserLoaded = true;
            var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (id is not null)
                _currentUser = await db.AdminUsers.AsNoTracking()
                    .FirstOrDefaultAsync(user => user.Id == id);
        }
        return _currentUser;
    }

    public Task SignInAsync(HttpContext context, AdminUser user) =>
        context.SignInAsync(AuthScheme,
            new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, user.Id)], AuthScheme)),
            new AuthenticationProperties
            {
                IsPersistent = false,
                ExpiresUtc = DateTimeOffset.UtcNow.AddHours(12),
                AllowRefresh = false
            });

    public Task SignOutAsync(HttpContext context) => context.SignOutAsync(AuthScheme);
}
