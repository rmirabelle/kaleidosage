//! A video export is written to disk while it is made: the webview sends the
//! MP4 in parts, each with the place in the file it goes to (the muxer goes
//! back to fill in sizes it learns later). So a long or large video never
//! has to fit in memory. The parts go to "<file>.part", which takes the
//! file's name only when the export is complete, so a stopped or failed
//! export leaves no broken video behind. A 360 video gets the mark that
//! makes headset players show it all around the viewer (see tag_spherical).
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
};
use tauri::ipc::{InvokeBody, Request};

struct OpenExport {
    target: PathBuf,
    part: PathBuf,
    file: File,
    spherical: bool,
}

/** The video exports that are being written, by id. */
#[derive(Default)]
pub struct Exports {
    next: AtomicU32,
    open: Mutex<HashMap<u32, OpenExport>>,
}

fn is_video_export(path: &Path) -> bool {
    path.is_absolute() && path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("mp4"))
}

/** The part file next to "target": "Clip.mp4" gives "Clip.mp4.part". */
fn part_path(target: &Path) -> PathBuf {
    let mut name = target.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

impl Exports {
    fn begin(&self, path: &str, spherical: bool) -> Result<u32, String> {
        let target = PathBuf::from(path);
        if !is_video_export(&target) {
            return Err("The export path is invalid".into());
        }
        let part = part_path(&target);
        /* Read too: tag_spherical reads the index back at the end. */
        let file = OpenOptions::new().read(true).write(true).create(true).truncate(true).open(&part).map_err(|error| format!("Could not write {}: {error}", part.display()))?;
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.open.lock().map_err(|_| "The export writer is unavailable")?.insert(id, OpenExport { target, part, file, spherical });
        Ok(id)
    }

    fn write(&self, id: u32, offset: u64, bytes: &[u8]) -> Result<(), String> {
        let mut open = self.open.lock().map_err(|_| "The export writer is unavailable")?;
        let export = open.get_mut(&id).ok_or("This export is no longer open")?;
        export.file.seek(SeekFrom::Start(offset)).and_then(|_| export.file.write_all(bytes)).map_err(|error| format!("Could not write the video: {error}"))
    }

    /** Ends the export: the part file becomes the video (it takes the place of a file with that name), or with "discard" it is removed. */
    fn finish(&self, id: u32, discard: bool) -> Result<(), String> {
        let export = self.open.lock().map_err(|_| "The export writer is unavailable")?.remove(&id).ok_or("This export is no longer open")?;
        let OpenExport { target, part, mut file, spherical } = export;
        if discard {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Ok(());
        }
        /* Without the mark the video still plays, flat, so a file the mark does not fit is kept as it is. */
        if spherical {
            if let Err(error) = tag_spherical(&mut file) {
                eprintln!("Could not mark {} as a 360 video: {error}", target.display());
            }
        }
        file.sync_all().map_err(|error| format!("Could not write the video: {error}"))?;
        drop(file);
        std::fs::rename(&part, &target).map_err(|error| format!("Could not save {}: {error}", target.display()))
    }
}

/** Starts a video export to "path" (an .mp4): returns its id for write_export and finish_export. "spherical" marks it as a 360 video. */
#[tauri::command]
pub fn begin_export(exports: tauri::State<'_, Exports>, path: String, spherical: Option<bool>) -> Result<u32, String> {
    exports.begin(&path, spherical.unwrap_or(false))
}

/** Writes one part of an export: the raw request body, at the "offset" header, to the export in the "export-id" header. */
#[tauri::command]
pub fn write_export(exports: tauri::State<'_, Exports>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The export data is missing".into());
    };
    let header = |name: &str| request.headers().get(name).and_then(|value| value.to_str().ok()).ok_or_else(|| format!("The {name} header is missing"));
    let id = header("export-id")?.parse::<u32>().map_err(|error| error.to_string())?;
    let offset = header("offset")?.parse::<u64>().map_err(|error| error.to_string())?;
    exports.write(id, offset, bytes)
}

#[tauri::command]
pub fn finish_export(exports: tauri::State<'_, Exports>, id: u32, discard: bool) -> Result<(), String> {
    exports.finish(id, discard)
}

/** The id of the Spherical Video V1 box (Google's spatial media format), which headset players such as the Quest's read. */
const SPHERICAL_UUID: [u8; 16] = [0xff, 0xcc, 0x82, 0x63, 0xf8, 0x55, 0x4a, 0x93, 0x88, 0x14, 0x58, 0x7a, 0x02, 0x52, 0x1f, 0xdd];
const SPHERICAL_XML: &str = concat!(
    r#"<?xml version="1.0"?><rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/">"#,
    "<GSpherical:Spherical>true</GSpherical:Spherical>",
    "<GSpherical:Stitched>true</GSpherical:Stitched>",
    "<GSpherical:StitchingSoftware>Kaleido Sage</GSpherical:StitchingSoftware>",
    "<GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType>",
    "</rdf:SphericalVideo>"
);

fn invalid(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, message.to_string())
}

/** The size of the box with a 32-bit size at "at" in "bytes". */
fn box_size(bytes: &[u8], at: usize) -> Option<usize> {
    bytes.get(at..at + 4).map(|size| u32::from_be_bytes(size.try_into().unwrap()) as usize)
}

/**
 * Marks an MP4 as a 360 equirectangular video: adds the Spherical Video V1
 * box at the end of its first track. The muxer writes the index ("moov")
 * last, so it can grow in place: nothing after it moves, and no offset in
 * the file points into it. A file laid out in any other way is left as it is.
 */
fn tag_spherical<F: Read + Write + Seek>(file: &mut F) -> std::io::Result<()> {
    let end = file.seek(SeekFrom::End(0))?;
    let mut offset = 0;
    let mut moov = None;
    while offset + 8 <= end {
        file.seek(SeekFrom::Start(offset))?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header[..8])?;
        let mut size = u64::from(u32::from_be_bytes(header[0..4].try_into().unwrap()));
        if size == 1 {
            file.read_exact(&mut header[8..16])?;
            size = u64::from_be_bytes(header[8..16].try_into().unwrap());
        } else if size == 0 {
            size = end - offset;
        }
        if size < 8 || offset + size > end {
            return Err(invalid("a box runs past the end of the file"));
        }
        if &header[4..8] == b"moov" {
            moov = Some((offset, size));
        }
        offset += size;
    }
    let (start, size) = moov.ok_or_else(|| invalid("the file has no index"))?;
    if start + size != end {
        return Err(invalid("the index is not at the end of the file"));
    }
    let mut moov = vec![0u8; size as usize];
    file.seek(SeekFrom::Start(start))?;
    file.read_exact(&mut moov)?;
    if box_size(&moov, 0) != Some(moov.len()) {
        return Err(invalid("the index has a 64-bit size"));
    }
    let mut child = 8;
    let (trak, trak_size) = loop {
        let child_size = box_size(&moov, child)
            .filter(|&child_size| child_size >= 8 && child + child_size <= moov.len())
            .ok_or_else(|| invalid("the index has no track"))?;
        if &moov[child + 4..child + 8] == b"trak" {
            break (child, child_size);
        }
        child += child_size;
    };
    let mut tag = Vec::with_capacity(24 + SPHERICAL_XML.len());
    tag.extend_from_slice(&((24 + SPHERICAL_XML.len()) as u32).to_be_bytes());
    tag.extend_from_slice(b"uuid");
    tag.extend_from_slice(&SPHERICAL_UUID);
    tag.extend_from_slice(SPHERICAL_XML.as_bytes());
    let grown = |at: usize, old: usize| u32::try_from(old + tag.len()).map(|new| (at, new)).map_err(|_| invalid("the index is too large"));
    let sizes = [grown(trak, trak_size)?, grown(0, moov.len())?];
    moov.splice(trak + trak_size..trak + trak_size, tag.iter().copied());
    for (at, new) in sizes {
        moov[at..at + 4].copy_from_slice(&new.to_be_bytes());
    }
    file.seek(SeekFrom::Start(start))?;
    file.write_all(&moov)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_parts_in_place_and_keeps_the_file_only_when_complete() {
        let folder = tempfile::tempdir().unwrap();
        let exports = Exports::default();
        let path = folder.path().join("Clip.mp4");
        let id = exports.begin(path.to_str().unwrap(), false).unwrap();
        exports.write(id, 0, b"----body").unwrap();
        exports.write(id, 0, b"head").unwrap();
        assert!(!path.exists());
        exports.finish(id, false).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"headbody");
        assert!(!part_path(&path).exists());

        let stopped = folder.path().join("Stopped.mp4");
        let id = exports.begin(stopped.to_str().unwrap(), false).unwrap();
        exports.write(id, 0, b"half").unwrap();
        exports.finish(id, true).unwrap();
        assert!(!stopped.exists() && !part_path(&stopped).exists());
    }

    #[test]
    fn refuses_other_paths() {
        let exports = Exports::default();
        assert!(exports.begin("relative.mp4", false).is_err());
        assert!(exports.begin(r"C:\Videos\clip.png", false).is_err());
    }

    /** A box with a 32-bit size. */
    fn mp4_box(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut bytes = ((8 + body.len()) as u32).to_be_bytes().to_vec();
        bytes.extend_from_slice(kind);
        bytes.extend_from_slice(body);
        bytes
    }

    #[test]
    fn marks_the_first_track_of_an_index_at_the_end() {
        let trak = mp4_box(b"trak", &mp4_box(b"tkhd", &[1; 12]));
        let mvhd = mp4_box(b"mvhd", &[2; 20]);
        let moov = mp4_box(b"moov", &[mvhd.clone(), trak.clone()].concat());
        let head = [mp4_box(b"ftyp", b"isom"), mp4_box(b"mdat", &[3; 40])].concat();
        let mut file = std::io::Cursor::new([head.clone(), moov].concat());
        tag_spherical(&mut file).unwrap();
        let bytes = file.into_inner();
        assert_eq!(&bytes[..head.len()], &head[..]);
        let moov = &bytes[head.len()..];
        assert_eq!(box_size(moov, 0), Some(moov.len()));
        let trak_at = 8 + mvhd.len();
        assert_eq!(&moov[8..trak_at], &mvhd[..]);
        assert_eq!(&moov[trak_at + 4..trak_at + 8], b"trak");
        assert_eq!(trak_at + box_size(moov, trak_at).unwrap(), moov.len());
        assert_eq!(&moov[trak_at + 8..trak_at + trak.len()], &trak[8..]);
        let tag = &moov[trak_at + trak.len()..];
        assert_eq!(box_size(tag, 0), Some(tag.len()));
        assert_eq!(&tag[4..8], b"uuid");
        assert_eq!(&tag[8..24], &SPHERICAL_UUID);
        assert_eq!(std::str::from_utf8(&tag[24..]).unwrap(), SPHERICAL_XML);
    }

    #[test]
    fn leaves_a_file_with_the_index_first_as_it_is() {
        let moov = mp4_box(b"moov", &mp4_box(b"trak", &[1; 8]));
        let original = [mp4_box(b"ftyp", b"isom"), moov, mp4_box(b"mdat", &[3; 40])].concat();
        let mut file = std::io::Cursor::new(original.clone());
        assert!(tag_spherical(&mut file).is_err());
        assert_eq!(file.into_inner(), original);
    }
}
