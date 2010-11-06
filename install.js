const APP_DISPLAY_NAME = "FxIF";
const APP_NAME = "fxif";
const APP_PACKAGE = "/Ted Mielczarek/fxif";
const APP_VERSION = "0.4.1";

const APP_JAR_FILE = "fxif.jar";
const APP_CONTENT_FOLDER = "content/";

const APP_SUCCESS_MESSAGE = "EXIF data will be displayed in the image properties window\n";


initInstall(APP_NAME, APP_PACKAGE, APP_VERSION);

var chromef = getFolder("Profile", "chrome");
var instFlags = PROFILE_CHROME;

var err = addFile(APP_PACKAGE, APP_VERSION, "chrome/" + APP_JAR_FILE, chromef, null);

if(err >= SUCCESS) {
	var jar = getFolder(chromef, APP_JAR_FILE);
	registerChrome(CONTENT | instFlags, jar, APP_CONTENT_FOLDER);
	registerChrome(LOCALE | instFlags, jar, "locale/cs/");
	registerChrome(LOCALE | instFlags, jar, "locale/de/");
	registerChrome(LOCALE | instFlags, jar, "locale/en-US/");
	registerChrome(LOCALE | instFlags, jar, "locale/es-ES/");
	registerChrome(LOCALE | instFlags, jar, "locale/it/");
	registerChrome(LOCALE | instFlags, jar, "locale/fr/");
	registerChrome(LOCALE | instFlags, jar, "locale/ja/");
	registerChrome(LOCALE | instFlags, jar, "locale/nl/");
	registerChrome(LOCALE | instFlags, jar, "locale/pl/");
	registerChrome(LOCALE | instFlags, jar, "locale/pt-BR/");
	registerChrome(LOCALE | instFlags, jar, "locale/ru/");
	registerChrome(LOCALE | instFlags, jar, "locale/zh-CN/");
	registerChrome(LOCALE | instFlags, jar, "locale/zh-TW/");
	err = performInstall();
	if(err >= SUCCESS) {
		alert(APP_NAME + " " + APP_VERSION + " has been succesfully installed.\n"
			+APP_SUCCESS_MESSAGE
			+"Please restart your browser before continuing.");
	} else {
		alert("Install failed. Error code:" + err);
		cancelInstall(err);
	}
} else {
	alert("Failed to create " +APP_JAR_FILE +"\n"
		+"You probably don't have appropriate permissions \n"
		+"(write access to Profile/chrome directory). \n"
		+"_____________________________\nError code:" + err);
	cancelInstall(err);
}