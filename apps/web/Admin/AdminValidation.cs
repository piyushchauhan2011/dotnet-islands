using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Hotel.Web.Admin;

internal sealed class AdminInputException(Dictionary<string, string> errors)
    : Exception("Invalid content.")
{
    public Dictionary<string, string> Errors { get; } = errors;
}

internal sealed class AdminValidation(JsonElement input)
{
    private readonly Dictionary<string, string> _errors = [];
    private static readonly Regex SlugPattern = new(
        "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(250));
    private static readonly HashSet<string> NodeTypes =
    [
        "paragraph", "heading", "blockquote", "bulletList", "orderedList",
        "image", "table", "destinationEmbed", "hotelEmbed", "roomEmbed", "offerEmbed"
    ];
    public string Kind => Text("kind", 1, 30);
    public string? Id => OptionalText("id", 1, 200);
    public string Slug => SlugValue();
    public string Status => Enum("status", "draft", "published");
    public IReadOnlyDictionary<string, string> Errors => _errors;

    private JsonElement Field(string name) =>
        input.ValueKind == JsonValueKind.Object && input.TryGetProperty(name, out var element)
            ? element : default;
    private void Error(string field, string message) => _errors.TryAdd(field, message);
    public string Text(string field, int min, int max) => ReadText(field, min, max, trim: true);
    public string RawText(string field, int min, int max) => ReadText(field, min, max, trim: false);
    private string ReadText(string field, int min, int max, bool trim)
    {
        var value = Field(field);
        var text = value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
        if (trim)
            text = text.Trim();
        if (text.Length < min || text.Length > max)
            Error(field, $"Must be between {min} and {max} characters.");
        return text;
    }
    public string? OptionalText(string field, int min, int max)
    {
        var value = Field(field);
        return value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            ? null : Text(field, min, max);
    }
    public string Enum(string field, params string[] allowed)
    {
        var value = Text(field, 1, 100);
        if (!allowed.Contains(value, StringComparer.Ordinal))
            Error(field, $"Must be one of: {string.Join(", ", allowed)}.");
        return value;
    }
    private string SlugValue()
    {
        var value = Text("slug", 1, 160);
        if (!SlugPattern.IsMatch(value))
            Error("slug", "Use lowercase letters, numbers, and hyphens.");
        return value;
    }
    public int Integer(string field, int min, int max)
    {
        var value = Field(field);
        if (TryNumber(value, out var number)
            && number >= min && number <= max && number == Math.Truncate(number))
            return (int)number;
        Error(field, $"Must be a whole number between {min} and {max}.");
        return 0;
    }
    public int? OptionalInteger(string field, int min, int max) =>
        Field(field).ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
            ? null : Integer(field, min, max);
    public double Number(string field, double min, double max)
    {
        if (TryNumber(Field(field), out var number)
            && double.IsFinite(number) && number >= min && number <= max)
            return number;
        Error(field, $"Must be a number between {min} and {max}.");
        return 0;
    }
    public double? OptionalNumber(string field, double min, double max) =>
        Field(field).ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
            ? null : Number(field, min, max);
    private static bool TryNumber(JsonElement value, out double number) =>
        value.ValueKind == JsonValueKind.Number
            ? value.TryGetDouble(out number)
            : double.TryParse(value.ValueKind == JsonValueKind.String ? value.GetString() : null,
                NumberStyles.Float, CultureInfo.InvariantCulture, out number);
    public string? Date(string field)
    {
        var value = OptionalText(field, 10, 10);
        if (value is not null
            && (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var parsed)
                || parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) != value))
            Error(field, "Use a valid YYYY-MM-DD date.");
        return value;
    }
    public JsonDocument Content()
    {
        var content = Field("content");
        if (content.ValueKind != JsonValueKind.Array)
        {
            Error("content", "Content must be an array.");
            return JsonDocument.Parse("[]");
        }
        var index = 0;
        foreach (var node in content.EnumerateArray())
            ValidateNode(node, $"content[{index++}]");
        return JsonDocument.Parse(content.GetRawText());
    }

    private void ValidateNode(JsonElement node, string path)
    {
        if (node.ValueKind != JsonValueKind.Object
            || !node.TryGetProperty("type", out var type)
            || type.ValueKind != JsonValueKind.String
            || !NodeTypes.Contains(type.GetString()!))
        {
            Error(path, "Unknown rich content node.");
            return;
        }
        foreach (var property in node.EnumerateObject())
        {
            if (!ValidProperty(property))
                Error(path, $"Invalid {property.Name} value.");
        }
        if (type.GetString() == "image"
            && node.TryGetProperty("src", out var src)
            && src.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(src.GetString())
            && !SafeImageUrl(src.GetString()!))
            Error(path, "Only local image paths or HTTPS images are allowed.");
    }

    private static bool ValidProperty(JsonProperty property)
    {
        var value = property.Value;
        return property.Name switch
        {
            "type" => true,
            "level" => value.ValueKind == JsonValueKind.Number
                && value.TryGetInt32(out var level) && level is >= 2 and <= 4,
            "text" or "src" or "alt" or "entityId" => value.ValueKind == JsonValueKind.String,
            "items" => value.ValueKind == JsonValueKind.Array
                && value.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String),
            "rows" => value.ValueKind == JsonValueKind.Array
                && value.EnumerateArray().All(row =>
                    row.ValueKind == JsonValueKind.Array
                    && row.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String)),
            _ => false
        };
    }
    public string Image(string field)
    {
        var value = Text(field, 1, 500);
        if (!SafeImageUrl(value))
            Error(field, "Only local image paths or HTTPS images are allowed.");
        return value;
    }
    private static bool SafeImageUrl(string url) =>
        url.StartsWith("/", StringComparison.Ordinal)
            && !url.StartsWith("//", StringComparison.Ordinal)
            && !url.Contains('\\') && !url.Any(char.IsControl)
        || Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps;
    public void Check()
    {
        if (_errors.Count > 0)
            throw new AdminInputException(_errors);
    }
}
