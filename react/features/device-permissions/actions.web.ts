import { batch } from 'react-redux';

import { IReduxState, IStore } from '../app/types';
import { openDialog } from '../base/dialog/actions';
import { isDialogOpen } from '../base/dialog/functions';
import { isMobileBrowser } from '../base/environment/utils';
import { createLocalTracksA } from '../base/tracks/actions.any';
import { getLocalTrack } from '../base/tracks/functions.any';
import { setDeviceStatusOk } from '../prejoin/actions.web';
import { isPrejoinPageVisible } from '../prejoin/functions';
import { setVideoSettingsVisibility } from '../settings/actions.web';
import { isButtonEnabled } from '../toolbox/functions.any';
import { isToolboxVisible } from '../toolbox/functions.web';

import { SET_VIDEO_PERMISSION_PROMPT } from './actionTypes';
import PermissionBlockedDialog from './components/web/PermissionBlockedDialog';
import PermissionPromptDialog from './components/web/PermissionPromptDialog';
import { CaptureKind, getKindsToPrompt, shouldShowGuidance } from './functions';

// A new key for every dialog, so that one opened while the previous one fades out isn't reused with its state.
let dialogKey = 0;

/**
 * Whether the camera button is on screen with its settings popover, which can then hold the explanation.
 *
 * @param {IReduxState} state - The redux state.
 * @returns {boolean}
 */
function canAnchorToCameraButton(state: IReduxState) {
    return !isMobileBrowser()
        && !state['features/base/responsive-ui'].isNarrowLayout
        && !isPrejoinPageVisible(state)
        && isButtonEnabled('camera', state)
        && isToolboxVisible(state);
}

/**
 * Explains why the devices are needed before the browser asks for access to them.
 *
 * @param {CaptureKind[]} kinds - The devices about to be requested.
 * @param {boolean} [whenUnmuting] - Whether the user is unmuting one device, in which case the dialog also offers
 * access to the other one.
 * @returns {Function} - Resolves with whether to go ahead with the request.
 */
export function explainBeforePrompt(kinds: CaptureKind[], whenUnmuting = false) {
    return (dispatch: IStore['dispatch'], getState: IStore['getState']): Promise<boolean> => {
        const state = getState();
        const toPrompt = getKindsToPrompt(state, kinds);

        if (!toPrompt.length || state['features/base/config'].disablePermissionPromptDialog) {
            return Promise.resolve(true);
        }

        const otherKind = toPrompt[0] === 'audio' ? 'video' : 'audio';
        const offerOtherKind = whenUnmuting && toPrompt.length === 1 && getKindsToPrompt(state, [ otherKind ]).length;
        const props = {
            kinds: toPrompt,
            otherKind: offerOtherKind ? otherKind : undefined
        };

        const { videoPrompt } = state['features/device-permissions'];

        // A request made while the camera request is still explained replaces it.
        if (videoPrompt) {
            videoPrompt.onDone(false);
            dispatch(hideVideoPermissionPrompt());
        }

        return new Promise(resolve => {
            if (whenUnmuting && toPrompt.length === 1 && toPrompt[0] === 'video' && canAnchorToCameraButton(state)) {
                batch(() => {
                    dispatch({
                        prompt: {
                            ...props,
                            onDone: resolve
                        },
                        type: SET_VIDEO_PERMISSION_PROMPT
                    });
                    dispatch(setVideoSettingsVisibility(true));
                });

                return;
            }

            dispatch(openDialog('PermissionPromptDialog', PermissionPromptDialog, {
                ...props,
                key: ++dialogKey,
                onDone: resolve,
                whenUnmuting
            }));
        });
    };
}

/**
 * Hides the explanation shown above the camera button, together with the popover holding it.
 *
 * @returns {Function}
 */
export function hideVideoPermissionPrompt() {
    return (dispatch: IStore['dispatch']) => {
        // In one go, the camera settings would otherwise open previews of every camera in between.
        batch(() => {
            dispatch(setVideoSettingsVisibility(false));
            dispatch({
                prompt: undefined,
                type: SET_VIDEO_PERMISSION_PROMPT
            });
        });
    };
}

/**
 * Requests the devices again, after the user unblocked them.
 *
 * @param {CaptureKind[]} kinds - The devices.
 * @returns {Function}
 */
export function retryDevices(kinds: CaptureKind[]) {
    return async (dispatch: IStore['dispatch'], getState: IStore['getState']) => {
        const missing = kinds.filter(kind => !getLocalTrack(getState()['features/base/tracks'], kind));

        await dispatch(createLocalTracksA({ devices: missing }));

        const state = getState();

        if (isPrejoinPageVisible(state)
                && missing.every(kind => getLocalTrack(state['features/base/tracks'], kind)?.jitsiTrack)) {
            dispatch(setDeviceStatusOk('prejoin.lookGood'));
        }
    };
}

/**
 * Guides the user through unblocking the devices after the requests for them were denied.
 *
 * @param {CaptureKind[]} kinds - The devices whose requests failed.
 * @returns {Function}
 */
export function showPermissionGuidance(kinds: CaptureKind[]) {
    return (dispatch: IStore['dispatch'], getState: IStore['getState']) => {
        const state = getState();
        let blocked = kinds.filter(kind => shouldShowGuidance(state, kind));

        // Each device fails on its own, so add it to the guidance already shown.
        if (isDialogOpen(state, PermissionBlockedDialog)) {
            const shown: CaptureKind[] = (state['features/base/dialog'].componentProps as any)?.kinds ?? [];

            if (blocked.every(kind => shown.includes(kind))) {
                return;
            }
            blocked = ([ 'audio', 'video' ] as CaptureKind[]).filter(kind => shown.includes(kind) || blocked.includes(kind));
        }

        if (!blocked.length) {
            return;
        }

        dispatch(openDialog('PermissionBlockedDialog', PermissionBlockedDialog, {
            key: ++dialogKey,
            kinds: blocked,
            onRetry: () => dispatch(retryDevices(blocked))
        }));
    };
}
