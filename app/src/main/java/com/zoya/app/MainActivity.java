package com.zoya.app;

import android.Manifest;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.material.floatingactionbutton.FloatingActionButton;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int PERMISSION_REQUEST_CODE = 1234;
    private static final String TAG = "ZoyaMain";
    private final OkHttpClient client = new OkHttpClient();
    
    // Replace with your actual Gemini API Key or use a secure way to store it
    private static final String GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; 

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                MainActivity.this.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        // Replace with your shared app URL
        webView.loadUrl("https://ais-pre-f52mjptsf7gkx2qpse2dvp-434933623132.asia-east1.run.app");

        checkPermissions();
        setupFab();
        checkForUpdates();
    }

    private void setupFab() {
        FloatingActionButton fab = findViewById(R.id.fab_world_update);
        fab.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                fetchWorldUpdate();
            }
        });
    }

    private void fetchWorldUpdate() {
        final ProgressDialog progressDialog = new ProgressDialog(this);
        progressDialog.setMessage("Fetching world awareness update...");
        progressDialog.setCancelable(false);
        progressDialog.show();

        String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + GEMINI_API_KEY;

        JSONObject jsonBody = new JSONObject();
        try {
            JSONArray contentsArray = new JSONArray();
            JSONObject contentObject = new JSONObject();
            JSONArray partsArray = new JSONArray();
            JSONObject partObject = new JSONObject();
            partObject.put("text", "Give me a brief summary of what is happening in the world today. Focus on major global events, technology, and science. Keep it concise.");
            partsArray.put(partObject);
            contentObject.put("parts", partsArray);
            contentsArray.put(contentObject);
            jsonBody.put("contents", contentsArray);
        } catch (JSONException e) {
            e.printStackTrace();
        }

        RequestBody body = RequestBody.create(
                jsonBody.toString(),
                MediaType.parse("application/json; charset=utf-8")
        );

        Request request = new Request.Builder()
                .url(url)
                .post(body)
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    progressDialog.dismiss();
                    Toast.makeText(MainActivity.this, "Failed to fetch update: " + e.getMessage(), Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                final String responseData = response.body().string();
                runOnUiThread(() -> {
                    progressDialog.dismiss();
                    if (response.isSuccessful()) {
                        try {
                            JSONObject jsonResponse = new JSONObject(responseData);
                            String text = jsonResponse.getJSONArray("candidates")
                                    .getJSONObject(0)
                                    .getJSONObject("content")
                                    .getJSONArray("parts")
                                    .getJSONObject(0)
                                    .getString("text");
                            showWorldUpdateDialog(text);
                        } catch (JSONException e) {
                            showWorldUpdateDialog("Error parsing response: " + e.getMessage() + "\n\nRaw: " + responseData);
                        }
                    } else {
                        showWorldUpdateDialog("API Error: " + response.code() + "\n\n" + responseData);
                    }
                });
            }
        });
    }

    private void showWorldUpdateDialog(String content) {
        new AlertDialog.Builder(this)
                .setTitle("World Awareness Update")
                .setMessage(content)
                .setPositiveButton("OK", null)
                .show();
    }

    private void checkForUpdates() {
        // Simple simulation of an auto-update check
        // In a real app, you would fetch a version JSON from your server/GitHub
        Log.d(TAG, "Checking for updates...");
        // If update found:
        // showUpdateDialog("https://example.com/zoya-latest.apk");
    }

    private void showUpdateDialog(final String apkUrl) {
        new AlertDialog.Builder(this)
                .setTitle("Update Available")
                .setMessage("A new version of Zoya is available. Would you like to upgrade now?")
                .setPositiveButton("Upgrade", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialogInterface, int i) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
                        startActivity(intent);
                    }
                })
                .setNegativeButton("Later", null)
                .show();
    }

    private void checkPermissions() {
        String[] permissions = {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.WRITE_CONTACTS,
            Manifest.permission.READ_CALENDAR,
            Manifest.permission.WRITE_CALENDAR,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.WRITE_CALL_LOG,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACTIVITY_RECOGNITION
        };

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            // Add Android 13+ specific permissions
            String[] tPermissions = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS
            };
            String[] combined = new String[permissions.length + tPermissions.length];
            System.arraycopy(permissions, 0, combined, 0, permissions.length);
            System.arraycopy(tPermissions, 0, combined, permissions.length, tPermissions.length);
            permissions = combined;
        } else {
            // Add legacy storage permissions
            String[] legacyPermissions = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            };
            String[] combined = new String[permissions.length + legacyPermissions.length];
            System.arraycopy(permissions, 0, combined, 0, permissions.length);
            System.arraycopy(legacyPermissions, 0, combined, permissions.length, legacyPermissions.length);
            permissions = combined;
        }

        boolean allGranted = true;
        for (String s : permissions) {
            if (ContextCompat.checkSelfPermission(this, s) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (!allGranted) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
