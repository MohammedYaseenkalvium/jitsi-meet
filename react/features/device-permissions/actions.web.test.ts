import { beforeEach, describe, expect, it, vi } from 'vitest';

import { explainBeforePrompt } from './actions.web';

const mocks = vi.hoisted(() => {
    return {
        isMobileBrowser: vi.fn(),
        isPrejoinPageVisible: vi.fn(),
        isToolboxVisible: vi.fn()
    };
});

vi.mock('react-redux', () => ({ batch: (fn: () => void) => fn() }));
vi.mock('../base/dialog/actions', () => ({
    openDialog: (name: string, _component: unknown, props: object) => ({ name, props, type: 'OPEN_DIALOG' })
}));
vi.mock('../base/dialog/functions', () => ({ isDialogOpen: () => false }));
vi.mock('../base/environment/environment', () => ({ isMacOS: () => true, isWindows: () => false }));
vi.mock('../base/environment/utils', () => ({ isMobileBrowser: mocks.isMobileBrowser }));
vi.mock('../base/lib-jitsi-meet', () => ({ browser: {} }));
vi.mock('../base/tracks/actions.any', () => ({}));
vi.mock('../base/tracks/functions.any', () => ({}));
vi.mock('../prejoin/actions.web', () => ({}));
vi.mock('../prejoin/functions', () => ({ isPrejoinPageVisible: mocks.isPrejoinPageVisible }));
vi.mock('../settings/actions.web', () => ({
    setVideoSettingsVisibility: (value: boolean) => ({ type: 'VIDEO_SETTINGS', value })
}));
vi.mock('../toolbox/functions.any', () => ({
    isButtonEnabled: (name: string, state: any) => state['features/toolbox'].toolbarButtons.includes(name)
}));
vi.mock('../toolbox/functions.web', () => ({ isToolboxVisible: mocks.isToolboxVisible }));
vi.mock('./components/web/PermissionBlockedDialog', () => ({ default: 'PermissionBlockedDialog' }));
vi.mock('./components/web/PermissionPromptDialog', () => ({ default: 'PermissionPromptDialog' }));

describe('explainBeforePrompt', () => {
    let dispatch: ReturnType<typeof vi.fn>;
    let state: any;

    const run = (kinds: Array<'audio' | 'video'>, whenUnmuting?: boolean) =>
        explainBeforePrompt(kinds, whenUnmuting)(dispatch as any, () => state);
    const dispatched = (type: string) => dispatch.mock.calls.map(([ action ]) => action).filter(a => a?.type === type);

    beforeEach(() => {
        vi.clearAllMocks();
        dispatch = vi.fn(action => {
            if (typeof action === 'function') {
                return action(dispatch, () => state);
            }
            if (action.type === 'SET_VIDEO_PERMISSION_PROMPT') {
                state['features/device-permissions'] = { videoPrompt: action.prompt };
            }

            return action;
        });
        state = {
            'features/base/config': {},
            'features/base/devices': {
                permissionStatus: {
                    audio: { state: 'prompt' },
                    video: { state: 'prompt' }
                }
            },
            'features/base/responsive-ui': { isNarrowLayout: false },
            'features/device-permissions': {},
            'features/toolbox': { toolbarButtons: [ 'camera', 'microphone' ] }
        };
        mocks.isMobileBrowser.mockReturnValue(false);
        mocks.isPrejoinPageVisible.mockReturnValue(false);
        mocks.isToolboxVisible.mockReturnValue(true);
    });

    it('goes ahead without asking when the browser won\'t prompt', async () => {
        state['features/base/devices'].permissionStatus.video = { state: 'granted' };

        expect(await run([ 'video' ], true)).toBe(true);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('asks above the camera button when the camera is unmuted from the toolbar', async () => {
        const answer = run([ 'video' ], true);

        expect(dispatched('OPEN_DIALOG')).toEqual([]);
        expect(dispatched('VIDEO_SETTINGS')).toEqual([ { type: 'VIDEO_SETTINGS', value: true } ]);

        const { videoPrompt } = state['features/device-permissions'];

        expect(videoPrompt).toEqual(expect.objectContaining({ kinds: [ 'video' ], otherKind: 'audio' }));
        videoPrompt.onDone(true);
        expect(await answer).toBe(true);
    });

    it.each([
        [ 'the toolbar is hidden', () => mocks.isToolboxVisible.mockReturnValue(false) ],
        [ 'the layout is narrow', () => {
            state['features/base/responsive-ui'].isNarrowLayout = true;
        } ],
        [ 'the toolbar has no camera button', () => {
            state['features/toolbox'].toolbarButtons = [ 'microphone' ];
        } ],
        [ 'the pre-join screen is shown', () => mocks.isPrejoinPageVisible.mockReturnValue(true) ],
        [ 'it is a mobile browser', () => mocks.isMobileBrowser.mockReturnValue(true) ]
    ])('asks in a dialog when %s', (_, setUp) => {
        setUp();
        run([ 'video' ], true);

        expect(dispatched('SET_VIDEO_PERMISSION_PROMPT')).toEqual([]);
        expect(dispatched('OPEN_DIALOG')).toEqual([
            expect.objectContaining({ name: 'PermissionPromptDialog' })
        ]);
    });

    it('asks in a dialog for the microphone and when joining', () => {
        run([ 'audio' ], true);
        run([ 'audio', 'video' ]);

        expect(dispatched('SET_VIDEO_PERMISSION_PROMPT')).toEqual([]);
        expect(dispatched('OPEN_DIALOG').map(a => a.props.kinds)).toEqual([ [ 'audio' ], [ 'audio', 'video' ] ]);
    });

    it('answers no to the camera request still explained when another one comes', async () => {
        const first = run([ 'video' ], true);

        run([ 'audio' ], true);

        expect(await first).toBe(false);
        expect(state['features/device-permissions'].videoPrompt).toBeUndefined();
    });
});
