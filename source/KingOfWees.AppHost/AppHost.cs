using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

// Tests pass PersistData=false so they never share the dev data volumes.
var persistData = builder.Configuration.GetValue("PersistData", true);

var mongo = builder.AddMongoDB("mongo");
if (persistData)
{
    mongo.WithDataVolume();
}
var kingDb = mongo.AddDatabase("king");

// Photos live in Blob storage: Azurite locally, the kingofweesphotos account in Azure (infra/README.md).
var storage = builder.AddAzureStorage("storage").RunAsEmulator(azurite =>
{
    if (persistData)
    {
        azurite.WithDataVolume();
    }
});
var photos = storage.AddBlobContainer("photos");

var server = builder.AddProject<Projects.KingOfWees_Server>("server")
    .WithReference(kingDb)
    .WaitFor(kingDb)
    .WithReference(photos)
    .WaitFor(photos)
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints();

var webfrontend = builder.AddViteApp("webfrontend", "../frontend")
    .WithBun()
    .WithReference(server)
    .WaitFor(server);

server.PublishWithContainerFiles(webfrontend, "wwwroot");

builder.Build().Run();
