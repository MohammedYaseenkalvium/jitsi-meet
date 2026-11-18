import { useCallback, useEffect, useRef, useState } from 'react';

import JitsiMeetJS from '../base/lib-jitsi-meet';

import { CaptureKind, getCaptureElement } from './functions';

interface IOptions {

    /**
     * Hides the dialog or the popover holding the explanation.
     */
    close: () => void;

    /**
     * The devices about to be requested.
     */
    kinds: CaptureKind[];

    /**
     * Invoked with whether to go ahead with the request.
     */
    onDone: (allowed: boolean) => void;

    /**
     * The other device, offered when unmuting one of them.
     */
    otherKind?: CaptureKind;
}

/**
 * Handles the answers to an explanation of the microphone and camera request.
 *
 * @param {IOptions} options - The options.
 * @returns {Object}
 */
export function usePermissionPrompt({ close, kinds, onDone, otherKind }: IOptions) {
    const done = useRef(false);

    // The browser's own button replaces the allow buttons where it's supported.
    const [ showCaptureElement, setShowCaptureElement ] = useState(() =>
        Boolean(getCaptureElement(kinds) && (!otherKind || getCaptureElement([ ...kinds, otherKind ]))));

    const finish = useCallback((allowed: boolean) => {
        if (!done.current) {
            done.current = true;
            onDone(allowed);
        }
    }, [ onDone ]);

    // Closed without an answer, e.g. replaced by another dialog.
    useEffect(() => () => finish(false), []);

    const allow = useCallback(() => {
        finish(true);
        close();
    }, [ close, finish ]);

    const allowBoth = useCallback(async () => {
        // A single prompt for both, the device that isn't being unmuted stays off.
        try {
            const tracks = await JitsiMeetJS.createLocalTracks({ devices: [ ...kinds, otherKind ] });

            tracks.forEach((track: any) => track.dispose());
        } catch {
            // The request for the unmuted device reports the failure.
        }
        allow();
    }, [ allow, kinds, otherKind ]);

    const cancel = useCallback(() => finish(false), [ finish ]);
    const onCaptureElementUnsupported = useCallback(() => setShowCaptureElement(false), []);

    return {
        allow,
        allowBoth,
        cancel,
        onCaptureElementUnsupported,
        showCaptureElement
    };
}
