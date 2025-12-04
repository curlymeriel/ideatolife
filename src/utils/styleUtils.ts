export const getAspectRatioPadding = (ratio: string) => {
    const ratioMap: Record<string, string> = {
        '16:9': '56.25%',
        '9:16': '177.78%',
        '1:1': '100%',
        '2.35:1': '42.55%'
    };
    return ratioMap[ratio] || '56.25%';
};
