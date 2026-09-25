using System.Text.Json;
using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

internal static class AdminInquiryRoutes
{
    internal static void MapInquiry(RouteGroupBuilder admin)
    {
        admin.MapPost("/inquiries/{id}/status",
            async (string id, HttpContext context, HotelDbContext db) =>
        {
            if (await AdminApi.AuthError(context, db) is { } unauthorized)
                return unauthorized;
            if (AdminApi.MutationError(context) is { } csrf)
                return csrf;
            if (!context.Request.HasJsonContentType())
                return Results.BadRequest(new
                {
                    error = "Expected application/json."
                });
            JsonElement body;
            try
            {
                body = await context.Request.ReadFromJsonAsync<JsonElement>();
            }
            catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
            {
                return Results.BadRequest(new
                {
                    error = "Invalid JSON."
                });
            }
            var validation = new AdminValidation(body);
            var status = validation.Enum("status", "new", "contacted", "closed");
            if (validation.Errors.Count > 0)
                return AdminApi.ValidationError(validation.Errors);
            var inquiry = await db.Inquiries.FirstOrDefaultAsync(x => x.Id == id);
            if (inquiry is null)
                return Results.NotFound();
            inquiry.Status = status;
            inquiry.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                ok = true
            });
        });
    }
}
