/**
 * The font families installed on the computer, for the Text effect's Font
 * menu. The names come from DirectWrite, which the webview also uses, so
 * each name works in a canvas font string as it is.
 */
#[tauri::command]
pub fn font_families() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        windows_families().map_err(|error| error.to_string())
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

#[cfg(windows)]
fn windows_families() -> windows::core::Result<Vec<String>> {
    use windows::core::{w, BOOL};
    use windows::Win32::Graphics::DirectWrite::{DWriteCreateFactory, IDWriteFactory, IDWriteFontCollection, DWRITE_FACTORY_TYPE_SHARED};

    let mut names = Vec::new();
    unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;
        let mut collection: Option<IDWriteFontCollection> = None;
        factory.GetSystemFontCollection(&mut collection, false)?;
        let Some(collection) = collection else { return Ok(names) };
        for index in 0..collection.GetFontFamilyCount() {
            let Ok(family) = collection.GetFontFamily(index) else { continue };
            let Ok(strings) = family.GetFamilyNames() else { continue };
            /* The English name when the family has one, else its first name. */
            let mut at = 0u32;
            let mut exists = BOOL(0);
            if strings.FindLocaleName(w!("en-us"), &mut at, &mut exists).is_err() || !exists.as_bool() {
                at = 0;
            }
            let Ok(length) = strings.GetStringLength(at) else { continue };
            let mut buffer = vec![0u16; length as usize + 1];
            if strings.GetString(at, &mut buffer).is_err() {
                continue;
            }
            let name = String::from_utf16_lossy(&buffer[..length as usize]);
            if !name.is_empty() {
                names.push(name);
            }
        }
    }
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup();
    Ok(names)
}
