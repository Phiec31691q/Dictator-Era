package com.dictatorera.game;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import java.io.InputStream;
import java.util.UUID;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends Activity {
 private WebView web;
 private SharedPreferences prefs;
 private static final String HOST="game.dictatorera.local";
 private static final String API="iprxpneqciysryvktmlh.supabase.co";
 private SecretKey sessionKey() throws Exception{
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
  if(!ks.containsAlias("dictator-era-session")){
   KeyGenerator kg=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   kg.init(new KeyGenParameterSpec.Builder("dictator-era-session",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
   kg.generateKey();
  }
  return (SecretKey)ks.getKey("dictator-era-session",null);
 }
 private String encryptSession(String value) throws Exception{
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,sessionKey());
  return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(c.doFinal(value.getBytes("UTF-8")),Base64.NO_WRAP);
 }
 private String decryptSession(String value) throws Exception{
  if(value.isEmpty())return "";
  String[] parts=value.split(":",2);if(parts.length!=2)return "";
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,sessionKey(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
  return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),"UTF-8");
 }
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  prefs=getSharedPreferences("dictator-era",MODE_PRIVATE);
  if(!prefs.contains("installation"))prefs.edit().putString("installation",UUID.randomUUID().toString()).apply();
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  getWindow().getDecorView().setSystemUiVisibility(5894);
  if(Build.VERSION.SDK_INT>=30){getWindow().getInsetsController().hide(android.view.WindowInsets.Type.systemBars());getWindow().getInsetsController().setSystemBarsBehavior(2);}
  web=new WebView(this);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(false);
  s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMediaPlaybackRequiresUserGesture(false);
  s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportZoom(false);s.setTextZoom(100);
  web.setBackgroundColor(0xff0b1721);web.addJavascriptInterface(new Bridge(),"Native");
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
    if("https".equals(req.getUrl().getScheme())&&API.equals(req.getUrl().getHost())&&req.getUrl().getPath().equals("/functions/v1/dictator-era"))return null;
    if(!HOST.equals(req.getUrl().getHost()))return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,null);
    try{
     String p=req.getUrl().getPath();if(p==null||p.equals("/"))p="/index.html";
     if(p.contains(".."))return null;
     String ext=p.substring(p.lastIndexOf('.')+1).toLowerCase();
     String mime="application/octet-stream";
     switch(ext){case "html":mime="text/html";break;case "js":mime="application/javascript";break;case "css":mime="text/css";break;case "json":mime="application/json";break;case "webp":mime="image/webp";break;case "png":mime="image/png";break;case "svg":mime="image/svg+xml";break;case "ttf":mime="font/ttf";break;case "wav":mime="audio/wav";break;}
     InputStream in=getAssets().open(p.substring(1));
     return new WebResourceResponse(mime,"UTF-8",in);
    }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,null);}
   }
   @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return !HOST.equals(r.getUrl().getHost());}
  });
  setContentView(web);web.loadUrl("https://"+HOST+"/index.html");
 }
 public class Bridge{
  @JavascriptInterface public String read(String key){try{String v=prefs.getString(key,"");return key.equals("online-session")?decryptSession(v):v;}catch(Exception e){return "";}}
  @JavascriptInterface public void write(String key,String value){try{if(value.length()<8000000)prefs.edit().putString(key,key.equals("online-session")?encryptSession(value):value).apply();}catch(Exception e){throw new IllegalStateException("Secure storage unavailable");}}
  @JavascriptInterface public String installation(){return prefs.getString("installation","");}
  @JavascriptInterface public String deviceHash(){
   try{
    String id=Settings.Secure.getString(getContentResolver(),Settings.Secure.ANDROID_ID);
    if(id==null)id=prefs.getString("installation","");
    byte[] digest=MessageDigest.getInstance("SHA-256").digest((getPackageName()+":"+id).getBytes("UTF-8"));
    StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format("%02x",b&255));return out.toString();
   }catch(Exception e){throw new IllegalStateException("Device identity unavailable");}
  }
  @JavascriptInterface public boolean online(){
   ConnectivityManager cm=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
   NetworkCapabilities n=cm.getNetworkCapabilities(cm.getActiveNetwork());
   return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
  }
  @JavascriptInterface public void haptic(){runOnUiThread(()->web.performHapticFeedback(1));}
  @JavascriptInterface public void exit(){runOnUiThread(()->finish());}
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.backAction && window.backAction()",null);}
 @Override protected void onPause(){super.onPause();web.evaluateJavascript("window.nativePause && window.nativePause()",null);web.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("Native");web.destroy();}super.onDestroy();}
}
