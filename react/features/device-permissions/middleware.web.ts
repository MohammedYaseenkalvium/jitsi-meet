import { NOTIFY_CAMERA_ERROR, NOTIFY_MIC_ERROR } from '../base/devices/actionTypes';
import { JitsiTrackErrors } from '../base/lib-jitsi-meet';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { TRACK_CREATE_ERROR } from '../base/tracks/actionTypes';
import { SET_PREJOIN_DEVICE_ERRORS } from '../prejoin/actionTypes';

import { showPermissionGuidance } from './actions.web';
import { CaptureKind } from './functions';

const isDenied = (error?: { name?: string; }) => error?.name === JitsiTrackErrors.PERMISSION_DENIED;

MiddlewareRegistry.register(store => next => action => {
    const result = next(action);
    let kinds: CaptureKind[] = [];

    switch (action.type) {
    case NOTIFY_CAMERA_ERROR:
        isDenied(action.error) && kinds.push('video');
        break;
    case NOTIFY_MIC_ERROR:
        isDenied(action.error) && kinds.push('audio');
        break;
    case SET_PREJOIN_DEVICE_ERRORS: {
        const { audioAndVideoError, audioOnlyError, videoOnlyError } = action.value ?? {};

        if (isDenied(audioAndVideoError)) {
            kinds = [ 'audio', 'video' ];
        } else {
            isDenied(audioOnlyError) && kinds.push('audio');
            isDenied(videoOnlyError) && kinds.push('video');
        }
        break;
    }
    case TRACK_CREATE_ERROR:
        if (isDenied(action.error) && (action.trackType === 'audio' || action.trackType === 'video')) {
            kinds.push(action.trackType);
        }
        break;
    }

    kinds.length && store.dispatch(showPermissionGuidance(kinds));

    return result;
});
