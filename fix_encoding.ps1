$files = @(
    ".\ai_service\package.json",
    ".\blog_service\package.json",
    ".\chat_service\package.json",
    ".\api_gateway\package.json",
    ".\mofukaze\package.json",
    ".\blog_service\tsconfig.json",
    ".\user_service\tsconfig.json",
    ".\docker-compose.yml",
    ".\docker-compose.dev.yml",
    ".\blog_service\src\index.ts",
    ".\docs\threat-model.md",
    ".\docs\testing-manual.md",
    ".\docs\security-design.md",
    ".\docs\README.md",
    ".\docs\operations-manual.md",
    ".\docs\opening-defense-speech.md",
    ".\docs\diagrams\system\proxy-communication.md",
    ".\docs\diagrams\system\overall-design.md",
    ".\docs\diagrams\README.md",
    ".\docs\diagrams\modules\user-service.md",
    ".\docs\diagrams\modules\resource-service.md",
    ".\docs\diagrams\modules\gateway.md",
    ".\docs\diagrams\modules\chat-service.md",
    ".\docs\diagrams\modules\blog-service.md",
    ".\docs\diagrams\modules\ai-service.md",
    ".\docs\deployment-manual.md",
    ".\docs\backup-history.md",
    ".\docs\architecture-manual.md",
    ".\docs\appendix-milestone-evidence.md",
    ".\docs\appendix-feature-implementation.md"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Get-Content -Path $file -Encoding UTF8 | Set-Content -Path $file -Encoding UTF8
        Write-Host "Fixed $file"
    } else {
        Write-Host "File not found: $file"
    }
}