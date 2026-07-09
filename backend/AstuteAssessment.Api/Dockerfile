FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY NuGet.config ./
COPY backend/AstuteAssessment.Api/AstuteAssessment.Api.csproj backend/AstuteAssessment.Api/
RUN dotnet restore backend/AstuteAssessment.Api/AstuteAssessment.Api.csproj --configfile NuGet.config

COPY backend/AstuteAssessment.Api/ backend/AstuteAssessment.Api/
RUN dotnet publish backend/AstuteAssessment.Api/AstuteAssessment.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["sh", "-c", "dotnet AstuteAssessment.Api.dll --urls http://0.0.0.0:${PORT:-8080}"]
