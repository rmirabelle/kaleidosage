/**
 * The color of the screen pixel under the mouse pointer, as "#rrggbb", for
 * the color picker's eyedropper. It reads what is on screen, so it sees the
 * finished picture. None when the pixel cannot be read.
 */
#[tauri::command]
pub fn screen_color_at_cursor() -> Option<String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut point = POINT { x: 0, y: 0 };
        unsafe {
            GetCursorPos(&mut point).ok()?;
            let screen = GetDC(None);
            if screen.is_invalid() {
                return None;
            }
            let color = GetPixel(screen, point.x, point.y).0;
            ReleaseDC(None, screen);
            /* CLR_INVALID: the point is outside every screen. */
            if color == u32::MAX {
                return None;
            }
            Some(color_to_hex(color))
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/** A Windows COLORREF (0x00bbggrr) as "#rrggbb". */
fn color_to_hex(color: u32) -> String {
    format!("#{:02x}{:02x}{:02x}", color & 0xff, (color >> 8) & 0xff, (color >> 16) & 0xff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colorref_becomes_rrggbb() {
        assert_eq!(color_to_hex(0x001a7aff), "#ff7a1a");
        assert_eq!(color_to_hex(0), "#000000");
    }

    /** Needs a desktop session, so it runs only on request: cargo test -- --ignored */
    #[test]
    #[ignore]
    #[cfg(windows)]
    fn reads_the_screen_under_the_pointer() {
        let color = screen_color_at_cursor().expect("no screen color");
        assert_eq!(color.len(), 7);
        assert!(color.starts_with('#'));
    }
}
