package com.igseek.app

import android.annotation.SuppressLint
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.*
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var activePopupDialog: Dialog? = null
    private var activePopupWebView: WebView? = null

    private inner class NativeStorageBridge(context: Context) {
        private val prefs = context.applicationContext.getSharedPreferences(
            "igseek_persist_prefs",
            Context.MODE_PRIVATE
        )

        @JavascriptInterface
        fun getItem(key: String?): String? {
            if (key.isNullOrEmpty()) return null
            return prefs.getString(key, null)
        }

        @JavascriptInterface
        fun setItem(key: String?, value: String?) {
            if (key.isNullOrEmpty()) return
            prefs.edit().putString(key, value ?: "").commit()
        }

        @JavascriptInterface
        fun removeItem(key: String?) {
            if (key.isNullOrEmpty()) return
            prefs.edit().remove(key).commit()
        }
    }

    private lateinit var nativeBridge: NativeStorageBridge

    // Target web app URL
    private val TARGET_URL = "https://really-igseek-2026.ai.studio"

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureSettings(settings: WebSettings, isPopup: Boolean = false) {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            val cleanUa = userAgentString
                .replace("; wv", "")
                .replace("wv;", "")
                .replace(Regex("""Version/\d+(?:\.\d+)?\s*"""), "")
                .replace(Regex("""\s+"""), " ")
                .trim()
            userAgentString = if (isPopup) {
                cleanUa
            } else if (!cleanUa.contains("IGseekAndroidApp")) {
                "$cleanUa IGseekAndroidApp/1.0"
            } else {
                cleanUa
            }
        }
    }

    private fun handleNonHttpScheme(url: String?, targetView: WebView?): Boolean {
        if (url.isNullOrBlank()) return false
        val lower = url.lowercase()
        // Keep ALL HTTP/HTTPS web, auth, and registration URLs strictly inside the APK WebView.
        if (
            lower.startsWith("http://") ||
            lower.startsWith("https://") ||
            lower.startsWith("about:") ||
            lower.startsWith("blob:") ||
            lower.startsWith("data:") ||
            lower.startsWith("javascript:")
        ) {
            return false
        }
        if (lower.startsWith("intent:")) {
            try {
                val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                val fallbackUrl = intent.getStringExtra("browser_fallback_url")
                val dataStr = intent.dataString
                val innerWebUrl = when {
                    !dataStr.isNullOrBlank() && (dataStr.startsWith("http://", true) || dataStr.startsWith("https://", true)) -> dataStr
                    !fallbackUrl.isNullOrBlank() && (fallbackUrl.startsWith("http://", true) || fallbackUrl.startsWith("https://", true)) -> fallbackUrl
                    else -> null
                }
                if (innerWebUrl != null) {
                    targetView?.loadUrl(innerWebUrl)
                    return true
                }
                startActivity(intent)
                return true
            } catch (_: Exception) {
                return true
            }
        }
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(intent)
            true
        } catch (_: Exception) {
            true
        }
    }

    private fun openInAppPopup(resultMsg: Message?): Boolean {
        val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false

        activePopupDialog?.dismiss()
        activePopupDialog = null
        activePopupWebView = null

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.WHITE)
        }

        val titleView = TextView(this).apply {
            text = "IGseek"
            setTextColor(Color.parseColor("#18181B"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val closeBtn = ImageButton(this).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setColorFilter(Color.parseColor("#18181B"))
            setBackgroundColor(Color.TRANSPARENT)
            contentDescription = "Close"
            val sizePx = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, 40f, resources.displayMetrics
            ).toInt()
            layoutParams = LinearLayout.LayoutParams(sizePx, sizePx)
        }

        val headerPad = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, 12f, resources.displayMetrics
        ).toInt()
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(headerPad, headerPad / 2, headerPad / 2, headerPad / 2)
            setBackgroundColor(Color.parseColor("#F4F4F5"))
            addView(titleView)
            addView(closeBtn)
        }

        val popupWebView = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            configureSettings(settings, isPopup = true)
            addJavascriptInterface(nativeBridge, "IGseekNativeBridge")
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
        }

        val dialog = Dialog(this, android.R.style.Theme_DeviceDefault_Light_NoActionBar)
        closeBtn.setOnClickListener {
            dialog.dismiss()
        }

        popupWebView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return handleNonHttpScheme(request?.url?.toString(), view)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return handleNonHttpScheme(url, view)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val pageTitle = view?.title?.takeIf { it.isNotBlank() }
                if (pageTitle != null) {
                    titleView.text = pageTitle
                }
            }
        }

        popupWebView.webChromeClient = object : WebChromeClient() {
            override fun onCloseWindow(window: WebView?) {
                dialog.dismiss()
            }

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                nestedResultMsg: Message?
            ): Boolean {
                val hitUrl = view?.hitTestResult?.extra
                if (!hitUrl.isNullOrBlank() && !handleNonHttpScheme(hitUrl, popupWebView)) {
                    popupWebView.loadUrl(hitUrl)
                    return false
                }
                return openInAppPopup(nestedResultMsg)
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                return startFileChooser(filePathCallback, fileChooserParams)
            }
        }

        dialog.setOnDismissListener {
            try {
                CookieManager.getInstance().flush()
            } catch (_: Exception) {
            }
            try {
                (popupWebView.parent as? ViewGroup)?.removeView(popupWebView)
                popupWebView.destroy()
            } catch (_: Exception) {
            }
            if (activePopupDialog === dialog) {
                activePopupDialog = null
                activePopupWebView = null
            }
        }

        container.addView(header)
        container.addView(popupWebView)
        dialog.setContentView(container)

        activePopupDialog = dialog
        activePopupWebView = popupWebView
        dialog.show()

        transport.webView = popupWebView
        resultMsg.sendToTarget()
        return true
    }

    private fun startFileChooser(
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: WebChromeClient.FileChooserParams?
    ): Boolean {
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = filePathCallback

        val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
        }
        return try {
            startActivityForResult(intent, 1001)
            true
        } catch (_: Exception) {
            fileUploadCallback = null
            false
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        nativeBridge = NativeStorageBridge(this)

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)

        webView = WebView(this).apply {
            configureSettings(settings, isPopup = false)
            addJavascriptInterface(nativeBridge, "IGseekNativeBridge")
            cookieManager.setAcceptThirdPartyCookies(this, true)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return handleNonHttpScheme(request?.url?.toString(), view)
                }

                @Deprecated("Deprecated in Java")
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                    return handleNonHttpScheme(url, view)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: Message?
                ): Boolean {
                    return openInAppPopup(resultMsg)
                }

                // Handle file uploads (photo / attachments)
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    return startFileChooser(filePathCallback, fileChooserParams)
                }
            }

            loadUrl(TARGET_URL)
        }

        setContentView(webView)
    }

    override fun onPause() {
        super.onPause()
        try {
            CookieManager.getInstance().flush()
        } catch (_: Exception) {
        }
    }

    override fun onStop() {
        super.onStop()
        try {
            CookieManager.getInstance().flush()
        } catch (_: Exception) {
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 1001) {
            if (fileUploadCallback == null) return
            var results: Array<Uri>? = null
            if (resultCode == RESULT_OK && data != null) {
                val dataString = data.dataString
                if (dataString != null) {
                    results = arrayOf(Uri.parse(dataString))
                } else if (data.clipData != null) {
                    val count = data.clipData!!.itemCount
                    results = Array(count) { i -> data.clipData!!.getItemAt(i).uri }
                }
            }
            fileUploadCallback?.onReceiveValue(results)
            fileUploadCallback = null
        }
    }

    override fun onBackPressed() {
        val popup = activePopupDialog
        val popupWv = activePopupWebView
        if (popup != null && popup.isShowing) {
            if (popupWv != null && popupWv.canGoBack()) {
                popupWv.goBack()
            } else {
                popup.dismiss()
            }
            return
        }
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
