// Helper function to check if asset name matches prompt
export const isNameMatch = (assetName: string, promptText: string): boolean => {
    const assetLower = assetName.toLowerCase().trim();
    const promptLower = promptText.toLowerCase();

    if (assetLower === promptLower) return true;

    const escapedAsset = assetLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const koreanParticles = '(?:이|가|은|는|을|를|의|에|에서|로|으로|와|과|도|만|부터|까지|한테|께|보고)?';
    const wordBoundaryRegex = new RegExp(
        `(^|\\s|[^a-z0-9가-힣])${escapedAsset}${koreanParticles}($|\\s|[^a-z0-9가-힣])`,
        'i'
    );

    if (wordBoundaryRegex.test(promptLower)) return true;

    const assetWords = assetName.split(/[\s\-_]+/).filter(w => w.length >= 4);
    if (assetWords.length > 1) {
        return assetWords.every(word => {
            const escapedWord = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordRegex = new RegExp(
                `(^|\\s|[^a-z0-9가-힣])${escapedWord}${koreanParticles}($|\\s|[^a-z0-9가-힣])`,
                'i'
            );
            return wordRegex.test(promptLower);
        });
    }

    return false;
};

// Helper function to get matched and deduplicated assets for a cut
export const getMatchedAssets = (prompt: string, manualAssetIds: string[], assetDefinitions: any, cutId?: number) => {
    const potentialMatches: Array<{ asset: any; isManual: boolean }> = [];

    Object.values(assetDefinitions || {}).forEach((asset: any) => {
        const isManual = manualAssetIds.includes(asset.id);
        const isAuto = isNameMatch(asset.name, prompt);

        if (isManual || isAuto) {
            potentialMatches.push({ asset, isManual });
            if (cutId) {
                // Console logs removed for performance in production, can be re-enabled for debugging
                // console.log(`[Draft ${cutId}] 🔍 Found potential match: "${asset.name}"`);
            }
        }
    });

    // Group by asset name to find duplicates
    const assetsByName = new Map<string, Array<{ asset: any; isManual: boolean }>>();
    potentialMatches.forEach((match) => {
        const name = match.asset.name;
        if (!assetsByName.has(name)) {
            assetsByName.set(name, []);
        }
        assetsByName.get(name)!.push(match);
    });

    // For each asset name, keep only the latest version
    const deduplicated: Array<{ asset: any; isManual: boolean }> = [];

    assetsByName.forEach((matches) => {
        // Sort by lastUpdated timestamp (most recent first)
        matches.sort((a, b) => {
            const timeA = a.asset.lastUpdated || 0;
            const timeB = b.asset.lastUpdated || 0;
            return timeB - timeA;
        });

        const latestMatch = matches[0];
        deduplicated.push(latestMatch);
    });

    deduplicated.sort((a, b) => b.asset.name.length - a.asset.name.length);

    return deduplicated;
};
