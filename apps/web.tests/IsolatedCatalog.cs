using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using Npgsql;

namespace Hotel.Web.Tests;

public sealed class IsolatedCatalog : IAsyncLifetime
{
    private readonly string _root = FindRoot();
    private readonly string _databaseName = "hotel_test_" + Guid.NewGuid().ToString("N");
    private readonly string _mediaDirectory = Path.Combine(
        Path.GetTempPath(),
        "hotel-web-tests-" + Guid.NewGuid().ToString("N"));
    private readonly string _password = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    private Process? _server;
    private string _databaseUrl = "";
    private string _adminUrl = "";
    private int _port;
    public HttpClient Client { get; private set; } = null!;
    public string AdminPassword => _password;
    public Uri Origin => new($"http://127.0.0.1:{_port}");
    public string ReferenceImagePath =>
        Path.Combine(_root, "apps/web/wwwroot/images/hero-1280.webp");

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null &&
               !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;
        return directory?.FullName
            ?? throw new InvalidOperationException("Cannot locate the workspace root.");
    }

    private NpgsqlConnectionStringBuilder Connection(string name)
    {
        var uri = new Uri(_adminUrl);
        var credentials = uri.UserInfo.Split(':', 2);
        return new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port,
            Database = name,
            Username = Uri.UnescapeDataString(credentials[0]),
            Password = Uri.UnescapeDataString(credentials[1])
        };
    }

    public async Task InitializeAsync()
    {
        var localEnv = Path.Combine(_root, ".env");
        var template = Environment.GetEnvironmentVariable("TEST_DATABASE_URL")
            ?? (File.Exists(localEnv)
                ? File.ReadLines(localEnv)
                    .FirstOrDefault(line => line.StartsWith(
                        "TEST_DATABASE_URL=",
                        StringComparison.Ordinal))?.Split('=', 2)[1]
                : null)
            ?? throw new InvalidOperationException(
                "TEST_DATABASE_URL must point to a dedicated *_test database.");
        var uri = new Uri(template);
        var parent = uri.AbsolutePath.Trim('/');
        if (!parent.EndsWith("_test", StringComparison.Ordinal))
            throw new InvalidOperationException(
                "Refusing to use a database without a *_test suffix.");
        _adminUrl = template;
        _databaseUrl = new UriBuilder(uri) { Path = "/" + _databaseName }.Uri.ToString();
        await using (var connection = new NpgsqlConnection(Connection(parent).ConnectionString))
        {
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand(
                $"CREATE DATABASE \"{_databaseName}\"",
                connection);
            await create.ExecuteNonQueryAsync();
        }
        Directory.CreateDirectory(_mediaDirectory);
        await Run("migrate");
        await Run("seed");
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        _port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        _server = Start("--urls", Origin.ToString().TrimEnd('/'));
        Client = new HttpClient { BaseAddress = Origin };
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(40));
        while (true)
        {
            timeout.Token.ThrowIfCancellationRequested();
            try
            {
                if ((await Client.GetAsync("/health", timeout.Token)).IsSuccessStatusCode)
                    break;
            }
            catch (HttpRequestException) { }
            await Task.Delay(150, timeout.Token);
        }
    }

    private Process Start(params string[] args)
    {
        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = _root,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        var arguments = new[]
        {
            "run", "--project", Path.Combine(_root, "apps/web/web.csproj"),
            "--no-build", "--no-launch-profile", "--"
        };
        foreach (var argument in arguments.Concat(args))
            start.ArgumentList.Add(argument);
        start.Environment["DATABASE_URL"] = _databaseUrl;
        start.Environment["MEDIA_DIR"] = _mediaDirectory;
        start.Environment["DATA_PROTECTION_KEYS_DIR"] = Path.Combine(_mediaDirectory, "keys");
        start.Environment["ADMIN_EMAIL"] = "isolated-admin@example.com";
        start.Environment["ADMIN_PASSWORD"] = _password;
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        start.Environment["SNAPSHOT_MODE"] = "off";
        start.Environment["Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command"] =
            "Warning";
        var process = Process.Start(start)
            ?? throw new InvalidOperationException("Could not start isolated web application.");
        process.OutputDataReceived += (_, _) => { };
        process.ErrorDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private async Task Run(string action)
    {
        using var process = Start(action);
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                $"Isolated web application {action} failed with code {process.ExitCode}.");
    }

    public async Task<string?> JobVersion(string path)
    {
        await using var connection =
            new NpgsqlConnection(Connection(_databaseName).ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT desired_version FROM snapshot_jobs WHERE path = @path",
            connection);
        command.Parameters.AddWithValue("path", path);
        return (string?)await command.ExecuteScalarAsync();
    }

    public async Task DisposeAsync()
    {
        Client?.Dispose();
        if (_server is { HasExited: false })
        {
            _server.Kill(entireProcessTree: true);
            await _server.WaitForExitAsync();
        }
        _server?.Dispose();
        if (!string.IsNullOrEmpty(_adminUrl))
        {
            var parent = new Uri(_adminUrl).AbsolutePath.Trim('/');
            await using var connection = new NpgsqlConnection(Connection(parent).ConnectionString);
            await connection.OpenAsync();
            await using var drop = new NpgsqlCommand(
                $"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)",
                connection);
            await drop.ExecuteNonQueryAsync();
        }
        if (Directory.Exists(_mediaDirectory))
            Directory.Delete(_mediaDirectory, true);
    }
}
