package com.happyharris.lockd;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins are registered before the bridge loads.
        registerPlugin(LockScreenTimerPlugin.class);
        registerPlugin(LockdHealthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
