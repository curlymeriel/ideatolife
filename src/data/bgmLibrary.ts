import type { BGMPreset } from '../store/types';

export const BGM_LIBRARY: BGMPreset[] = [
    // Cinematic
    {
        id: 'bgm_cinematic_01',
        title: 'Hero Down',
        artist: 'Kevin MacLeod',
        category: 'Cinematic',
        url: '/music/cinematic_hero.mp3',
        duration: 210
    },

    // Happy / Bright
    {
        id: 'bgm_happy_01',
        title: 'Monkeys Spinning Monkeys',
        artist: 'Kevin MacLeod',
        category: 'Happy',
        url: '/music/happy_monkeys.mp3',
        duration: 245
    },
    {
        id: 'bgm_happy_02',
        title: 'Happy Carefree',
        artist: 'Unknown',
        category: 'Happy',
        url: '/music/happy_carefree.mp3',
        duration: 160
    },

    // Calm / Ambient
    {
        id: 'bgm_calm_01',
        title: 'Local Forecast - Elevator',
        artist: 'Kevin MacLeod',
        category: 'Calm',
        url: '/music/calm_elevator.mp3',
        duration: 180
    },

    // Sad / Emotional
    {
        id: 'bgm_sad_01',
        title: 'Heartbreaking',
        artist: 'Kevin MacLeod',
        category: 'Sad',
        url: '/music/sad_heartbreaking.mp3',
        duration: 180
    },
    {
        id: 'bgm_sad_02',
        title: 'Prelude and Action',
        artist: 'Kevin MacLeod',
        category: 'Sad',
        url: '/music/sad_prelude.mp3',
        duration: 190
    },
    {
        id: 'bgm_sad_03',
        title: 'Loss',
        artist: 'Kevin MacLeod',
        category: 'Sad',
        url: '/music/sad_loss.mp3',
        duration: 210
    },

    // Action / Thriller
    {
        id: 'bgm_action_01',
        title: 'Impact Moderato',
        artist: 'Kevin MacLeod',
        category: 'Action',
        url: '/music/action_impact.mp3',
        duration: 180
    },
    {
        id: 'bgm_thriller_01',
        title: 'Giant Wyrm',
        artist: 'Kevin MacLeod',
        category: 'Thriller',
        url: '/music/thriller_giant_wyrm.mp3',
        duration: 180
    },
    {
        id: 'bgm_thriller_02',
        title: 'Apprehension',
        artist: 'Kevin MacLeod',
        category: 'Thriller',
        url: '/music/thriller_apprehension.mp3',
        duration: 180
    },
    {
        id: 'bgm_thriller_03',
        title: 'Unseen Horrors',
        artist: 'Kevin MacLeod',
        category: 'Thriller',
        url: '/music/thriller_unseen_horrors.mp3',
        duration: 180
    },

    // Epic / Grand
    {
        id: 'bgm_epic_01',
        title: 'Crusade',
        artist: 'Kevin MacLeod',
        category: 'Epic',
        url: '/music/epic_crusade.mp3',
        duration: 180
    },

    // Quirky / Funny
    {
        id: 'bgm_quirky_01',
        title: 'Pixel Peeker Polka',
        artist: 'Kevin MacLeod',
        category: 'Quirky',
        url: '/music/happy_pixel_polka.mp3',
        duration: 180
    },
    {
        id: 'bgm_quirky_02',
        title: 'Sneaky Snitch',
        artist: 'Kevin MacLeod',
        category: 'Quirky',
        url: '/music/quirky_sneaky_snitch.mp3',
        duration: 180
    },
];

// Helper to categorize
export const getBgmByCategory = () => {
    const categories: Record<string, BGMPreset[]> = {};
    BGM_LIBRARY.forEach(track => {
        if (!categories[track.category]) categories[track.category] = [];
        categories[track.category].push(track);
    });
    return categories;
};
