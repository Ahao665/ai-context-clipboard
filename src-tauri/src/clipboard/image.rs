//! Clipboard image capture: `CF_DIB` -> BMP, plus a thumbnail.
//!
//! WebView2 renders BMP directly, so nothing here needs an image codec — which
//! matters because this project deliberately carries no image dependency.
//!
//! Every DIB is re-encoded as 24-bit BGR rather than passed through, for two
//! reasons: the clipboard DIB has no file header at all, and a 32-bit `BI_RGB`
//! DIB — which is what a screenshot usually is — typically carries a zero alpha
//! byte that renderers honour as fully transparent. Dropping the fourth byte is
//! what keeps the picture visible instead of showing an empty box.

/// A decoded, top-down 24-bit BGR image with 4-byte-aligned rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pixels {
    pub width: u32,
    pub height: u32,
    /// Bytes per row, padded to a 4-byte boundary.
    pub stride: usize,
    pub data: Vec<u8>,
}

const BITMAPINFOHEADER_SIZE: u32 = 40;
const BI_RGB: u32 = 0;
const FILE_HEADER_SIZE: u32 = 14;
const INFO_HEADER_SIZE: u32 = 40;
/// 96 DPI expressed in pixels per metre. Only a hint; nothing reads it back.
const PELS_PER_METRE: i32 = 2835;

/// Bytes per row for a given width, rounded up to a 4-byte boundary.
///
/// BMP rows are always aligned this way, in the DIB as well as in the file, so
/// a 3-byte-per-pixel row of odd width carries padding that must not be copied
/// into the next row.
pub fn row_stride(width: u32, bytes_per_pixel: u32) -> usize {
    let raw = width as usize * bytes_per_pixel as usize;
    (raw + 3) & !3
}

/// Decode a `CF_DIB` payload into top-down 24-bit BGR.
///
/// Only uncompressed 24- and 32-bit bitmaps are handled; everything else is
/// reported as an error so the caller can leave the capture alone rather than
/// store something that will not render.
pub fn decode_dib(dib: &[u8]) -> Result<Pixels, String> {
    if dib.len() < BITMAPINFOHEADER_SIZE as usize {
        return Err(format!("DIB 太小（{} 字节）", dib.len()));
    }

    let u32_at = |off: usize| u32::from_le_bytes(dib[off..off + 4].try_into().unwrap());
    let i32_at = |off: usize| i32::from_le_bytes(dib[off..off + 4].try_into().unwrap());
    let u16_at = |off: usize| u16::from_le_bytes(dib[off..off + 2].try_into().unwrap());

    let header_size = u32_at(0);
    let width = i32_at(4);
    let height = i32_at(8);
    let bit_count = u16_at(14);
    let compression = u32_at(16);

    if header_size < BITMAPINFOHEADER_SIZE {
        return Err(format!("不支持的 DIB 头（biSize={header_size}）"));
    }
    if width <= 0 || height == 0 {
        return Err(format!("DIB 尺寸非法（{width}x{height}）"));
    }
    if compression != BI_RGB {
        return Err(format!("不支持的压缩方式（biCompression={compression}）"));
    }
    if bit_count != 24 && bit_count != 32 {
        return Err(format!("不支持的位深（biBitCount={bit_count}）"));
    }

    let width = width as u32;
    // A positive height means the rows are stored bottom-up.
    let bottom_up = height > 0;
    let height = height.unsigned_abs();

    let bytes_per_pixel = (bit_count / 8) as u32;
    let src_stride = row_stride(width, bytes_per_pixel);
    // 24- and 32-bit bitmaps carry no colour table, so the pixels start right
    // after the header.
    let src_offset = header_size as usize;
    let needed = src_offset + src_stride * height as usize;
    if dib.len() < needed {
        return Err(format!(
            "DIB 数据不完整（需要 {needed} 字节，实际 {}）",
            dib.len()
        ));
    }

    let dst_stride = row_stride(width, 3);
    let mut data = vec![0u8; dst_stride * height as usize];
    let row_bytes = width as usize * bytes_per_pixel as usize;

    for y in 0..height as usize {
        let src_y = if bottom_up { height as usize - 1 - y } else { y };
        let src = &dib[src_offset + src_y * src_stride..][..row_bytes];
        let dst = &mut data[y * dst_stride..][..width as usize * 3];
        for x in 0..width as usize {
            let s = &src[x * bytes_per_pixel as usize..];
            let d = &mut dst[x * 3..];
            d[0] = s[0]; // blue
            d[1] = s[1]; // green
            d[2] = s[2]; // red
                          // s[3] (alpha) is dropped on purpose — see the module comment.
        }
    }

    Ok(Pixels {
        width,
        height,
        stride: dst_stride,
        data,
    })
}

/// Wrap decoded pixels in a BMP file.
///
/// The height in the info header is negative, which marks the rows as top-down
/// so no vertical flip is needed here.
pub fn to_bmp(img: &Pixels) -> Vec<u8> {
    let pixel_bytes = img.stride * img.height as usize;
    let file_size = FILE_HEADER_SIZE as usize + INFO_HEADER_SIZE as usize + pixel_bytes;
    let mut out = Vec::with_capacity(file_size);

    // BITMAPFILEHEADER
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&(file_size as u32).to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes()); // bfReserved1
    out.extend_from_slice(&0u16.to_le_bytes()); // bfReserved2
    out.extend_from_slice(&(FILE_HEADER_SIZE + INFO_HEADER_SIZE).to_le_bytes()); // bfOffBits

    // BITMAPINFOHEADER
    out.extend_from_slice(&INFO_HEADER_SIZE.to_le_bytes()); // biSize
    out.extend_from_slice(&(img.width as i32).to_le_bytes());
    out.extend_from_slice(&(-(img.height as i32)).to_le_bytes()); // top-down
    out.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    out.extend_from_slice(&24u16.to_le_bytes()); // biBitCount
    out.extend_from_slice(&BI_RGB.to_le_bytes()); // biCompression
    out.extend_from_slice(&(pixel_bytes as u32).to_le_bytes()); // biSizeImage
    out.extend_from_slice(&PELS_PER_METRE.to_le_bytes());
    out.extend_from_slice(&PELS_PER_METRE.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    out.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant

    out.extend_from_slice(&img.data);
    out
}

/// Convert a stored BMP file back into a clipboard-ready `CF_DIB` payload.
///
/// Two things change on the way out. The 14-byte `BITMAPFILEHEADER` is dropped,
/// because `CF_DIB` begins at the info header. And the rows are flipped back to
/// bottom-up with a positive height: the stored BMP is top-down, and while a
/// negative height is legal in a DIB, enough consumers still assume the classic
/// orientation that a vertically mirrored paste is not worth discovering at
/// runtime.
pub fn bmp_to_dib(bmp: &[u8]) -> Result<Vec<u8>, String> {
    let minimum = FILE_HEADER_SIZE as usize + INFO_HEADER_SIZE as usize;
    if bmp.len() < minimum {
        return Err(format!("BMP 太小（{} 字节）", bmp.len()));
    }
    if &bmp[0..2] != b"BM" {
        return Err("不是 BMP 文件".to_string());
    }

    let u32_at = |off: usize| u32::from_le_bytes(bmp[off..off + 4].try_into().unwrap());
    let i32_at = |off: usize| i32::from_le_bytes(bmp[off..off + 4].try_into().unwrap());
    let u16_at = |off: usize| u16::from_le_bytes(bmp[off..off + 2].try_into().unwrap());

    // bfOffBits is where the pixels start; it accounts for the info header and
    // any colour table, so it is more reliable than 14 + biSize.
    let pixel_offset = u32_at(10) as usize;
    let header_size = u32_at(14) as usize;
    let width = i32_at(18);
    let height = i32_at(22);
    let bit_count = u16_at(28);
    let compression = u32_at(30);

    if header_size < INFO_HEADER_SIZE as usize {
        return Err(format!("不支持的 BMP 头（biSize={header_size}）"));
    }
    if width <= 0 || height == 0 {
        return Err(format!("BMP 尺寸非法（{width}x{height}）"));
    }
    if compression != BI_RGB {
        return Err(format!("不支持的压缩方式（biCompression={compression}）"));
    }
    if bit_count != 24 {
        return Err(format!("不支持的位深（biBitCount={bit_count}）"));
    }
    if FILE_HEADER_SIZE as usize + header_size > bmp.len() {
        return Err(format!("BMP 头不完整（biSize={header_size}）"));
    }

    let width = width as u32;
    let stride = row_stride(width, 3);
    let rows = height.unsigned_abs() as usize;
    let pixels_end = pixel_offset + stride * rows;
    if bmp.len() < pixels_end {
        return Err(format!(
            "BMP 数据不完整（需要 {pixels_end} 字节，实际 {}）",
            bmp.len()
        ));
    }

    let mut dib = Vec::with_capacity(header_size + stride * rows);
    dib.extend_from_slice(&bmp[FILE_HEADER_SIZE as usize..FILE_HEADER_SIZE as usize + header_size]);
    // Offsets below are relative to the info header, which now starts at 0.
    dib[8..12].copy_from_slice(&(rows as i32).to_le_bytes()); // biHeight: bottom-up
    dib[20..24].copy_from_slice(&((stride * rows) as u32).to_le_bytes()); // biSizeImage

    let pixels = &bmp[pixel_offset..pixels_end];
    if height < 0 {
        // Stored top-down, so reverse the rows to hand over bottom-up.
        for row in (0..rows).rev() {
            dib.extend_from_slice(&pixels[row * stride..][..stride]);
        }
    } else {
        dib.extend_from_slice(pixels);
    }

    Ok(dib)
}

/// Box-filter downscale so the longest edge is at most `max_edge`.
///
/// Averaging rather than sampling keeps small text in a screenshot legible at
/// thumbnail size. Returns a copy unchanged when the image already fits.
pub fn downscale(img: &Pixels, max_edge: u32) -> Pixels {
    let longest = img.width.max(img.height);
    if max_edge == 0 || longest <= max_edge {
        return img.clone();
    }

    let scale = longest as f64 / max_edge as f64;
    let out_w = ((img.width as f64 / scale).round() as u32).max(1);
    let out_h = ((img.height as f64 / scale).round() as u32).max(1);
    let out_stride = row_stride(out_w, 3);
    let mut data = vec![0u8; out_stride * out_h as usize];

    for oy in 0..out_h as usize {
        let y0 = oy * img.height as usize / out_h as usize;
        let y1 = (((oy + 1) * img.height as usize).div_ceil(out_h as usize))
            .max(y0 + 1)
            .min(img.height as usize);

        for ox in 0..out_w as usize {
            let x0 = ox * img.width as usize / out_w as usize;
            let x1 = (((ox + 1) * img.width as usize).div_ceil(out_w as usize))
                .max(x0 + 1)
                .min(img.width as usize);

            let mut sums = [0u32; 3];
            let mut count = 0u32;
            for y in y0..y1 {
                for x in x0..x1 {
                    let p = y * img.stride + x * 3;
                    sums[0] += img.data[p] as u32;
                    sums[1] += img.data[p + 1] as u32;
                    sums[2] += img.data[p + 2] as u32;
                    count += 1;
                }
            }

            let d = oy * out_stride + ox * 3;
            data[d] = (sums[0] / count) as u8;
            data[d + 1] = (sums[1] / count) as u8;
            data[d + 2] = (sums[2] / count) as u8;
        }
    }

    Pixels {
        width: out_w,
        height: out_h,
        stride: out_stride,
        data,
    }
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding.
///
/// Hand-rolled because the only consumer is the `data:` URL built for the
/// webview, and that is not worth a dependency.
pub fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;

        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            B64[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// Longest edge of the stored thumbnail.
pub const THUMBNAIL_EDGE: u32 = 320;

/// Suffix of the downscaled companion written alongside each capture.
pub const THUMB_SUFFIX: &str = ".thumb.bmp";

/// `<hash>.bmp` -> `<hash>.thumb.bmp`.
///
/// Lives here rather than in the command layer because the purge path needs it
/// too: reclaiming a deleted capture has to remove its thumbnail as well, or the
/// images directory would keep half of every deleted picture.
pub fn thumbnail_name(file_name: &str) -> String {
    match file_name.strip_suffix(".bmp") {
        Some(stem) => format!("{stem}{THUMB_SUFFIX}"),
        None => format!("{file_name}{THUMB_SUFFIX}"),
    }
}

/// The two files written for one image capture.
pub struct EncodedImage {
    pub full: Vec<u8>,
    pub thumbnail: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Decode a DIB and produce both the full-size BMP and its thumbnail.
pub fn encode_capture(dib: &[u8]) -> Result<EncodedImage, String> {
    let pixels = decode_dib(dib)?;
    Ok(EncodedImage {
        full: to_bmp(&pixels),
        thumbnail: to_bmp(&downscale(&pixels, THUMBNAIL_EDGE)),
        width: pixels.width,
        height: pixels.height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a `BITMAPINFOHEADER` plus pixel rows.
    fn dib(width: i32, height: i32, bit_count: u16, compression: u32, rows: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&BITMAPINFOHEADER_SIZE.to_le_bytes());
        out.extend_from_slice(&width.to_le_bytes());
        out.extend_from_slice(&height.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes()); // planes
        out.extend_from_slice(&bit_count.to_le_bytes());
        out.extend_from_slice(&compression.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes()); // sizeImage
        out.extend_from_slice(&0i32.to_le_bytes()); // xppm
        out.extend_from_slice(&0i32.to_le_bytes()); // yppm
        out.extend_from_slice(&0u32.to_le_bytes()); // clrUsed
        out.extend_from_slice(&0u32.to_le_bytes()); // clrImportant
        out.extend_from_slice(rows);
        out
    }

    #[test]
    fn test_row_stride_pads_to_four_bytes() {
        assert_eq!(row_stride(1, 3), 4);
        assert_eq!(row_stride(2, 3), 8);
        assert_eq!(row_stride(4, 3), 12);
        assert_eq!(row_stride(1, 4), 4);
        assert_eq!(row_stride(3, 4), 12);
    }

    #[test]
    fn test_decode_24bpp_drops_row_padding() {
        // Two rows of 1 pixel each: 3 data bytes + 1 byte of padding per row.
        let rows = [10, 20, 30, 0xEE, 40, 50, 60, 0xEE];
        let img = decode_dib(&dib(1, 2, 24, BI_RGB, &rows)).expect("decodes");
        assert_eq!((img.width, img.height), (1, 2));
        assert_eq!(img.stride, 4);
        // Bottom-up: the *second* stored row is the top row of the image.
        assert_eq!(&img.data[0..3], &[40, 50, 60]);
        assert_eq!(&img.data[4..7], &[10, 20, 30]);
    }

    #[test]
    fn test_decode_32bpp_discards_the_alpha_byte() {
        // A screenshot-style 32-bit DIB whose alpha byte is zero. If it were
        // preserved the image would render fully transparent.
        let rows = [1, 2, 3, 0, 4, 5, 6, 0];
        let img = decode_dib(&dib(2, 1, 32, BI_RGB, &rows)).expect("decodes");
        assert_eq!(img.stride, 8);
        assert_eq!(&img.data[0..6], &[1, 2, 3, 4, 5, 6]);
        // No fourth byte survives anywhere in the decoded buffer.
        assert_eq!(img.data.len(), 8);
    }

    #[test]
    fn test_decode_top_down_when_height_is_negative() {
        let rows = [10, 20, 30, 0, 40, 50, 60, 0];
        let img = decode_dib(&dib(1, -2, 24, BI_RGB, &rows)).expect("decodes");
        // Top-down: the first stored row stays first.
        assert_eq!(&img.data[0..3], &[10, 20, 30]);
        assert_eq!(&img.data[4..7], &[40, 50, 60]);
    }

    #[test]
    fn test_decode_rejects_compressed_dib() {
        let rows = [0u8; 8];
        let err = decode_dib(&dib(1, 1, 24, 3, &rows)).expect_err("must reject");
        assert!(err.contains("压缩"), "got {err}");
    }

    #[test]
    fn test_decode_rejects_unsupported_bit_depth() {
        let rows = [0u8; 8];
        let err = decode_dib(&dib(1, 1, 8, BI_RGB, &rows)).expect_err("must reject");
        assert!(err.contains("位深"), "got {err}");
    }

    #[test]
    fn test_decode_rejects_truncated_pixels() {
        // Claims 4x4 but supplies one row.
        let rows = [0u8; 12];
        let err = decode_dib(&dib(4, 4, 24, BI_RGB, &rows)).expect_err("must reject");
        assert!(err.contains("不完整"), "got {err}");
    }

    #[test]
    fn test_decode_rejects_short_buffer() {
        assert!(decode_dib(&[0u8; 8]).is_err());
    }

    #[test]
    fn test_to_bmp_header_fields() {
        let img = Pixels {
            width: 2,
            height: 3,
            stride: 8,
            data: vec![0u8; 24],
        };
        let bmp = to_bmp(&img);

        assert_eq!(&bmp[0..2], b"BM");
        let file_size = u32::from_le_bytes(bmp[2..6].try_into().unwrap());
        assert_eq!(file_size as usize, bmp.len());
        assert_eq!(file_size, 14 + 40 + 24);

        let off_bits = u32::from_le_bytes(bmp[10..14].try_into().unwrap());
        assert_eq!(off_bits, 54);

        let header_size = u32::from_le_bytes(bmp[14..18].try_into().unwrap());
        assert_eq!(header_size, 40);

        let w = i32::from_le_bytes(bmp[18..22].try_into().unwrap());
        let h = i32::from_le_bytes(bmp[22..26].try_into().unwrap());
        assert_eq!(w, 2);
        // Negative height marks the rows as top-down.
        assert_eq!(h, -3);

        let bit_count = u16::from_le_bytes(bmp[28..30].try_into().unwrap());
        assert_eq!(bit_count, 24);
        let compression = u32::from_le_bytes(bmp[30..34].try_into().unwrap());
        assert_eq!(compression, BI_RGB);
    }

    #[test]
    fn test_downscale_halves_the_longest_edge() {
        let img = Pixels {
            width: 4,
            height: 2,
            stride: 12,
            data: vec![100u8; 24],
        };
        let small = downscale(&img, 2);
        assert_eq!((small.width, small.height), (2, 1));
        // Uniform input must average back to the same value.
        assert!(small.data[0..6].iter().all(|&b| b == 100));
    }

    #[test]
    fn test_downscale_is_a_noop_when_already_small() {
        let img = Pixels {
            width: 2,
            height: 2,
            stride: 8,
            data: vec![7u8; 16],
        };
        assert_eq!(downscale(&img, 320), img);
    }

    #[test]
    fn test_downscale_averages_neighbours() {
        // 2x1 image, black next to white, stride 8. Pixels inside a row are
        // packed; the two padding bytes only ever trail the row, so pixel 1
        // starts at offset 3 — not at 4.
        let img = Pixels {
            width: 2,
            height: 1,
            stride: 8,
            data: vec![0, 0, 0, 255, 255, 255, 0, 0],
        };
        let small = downscale(&img, 1);
        assert_eq!((small.width, small.height), (1, 1));
        assert_eq!(&small.data[0..3], &[127, 127, 127]);
    }

    #[test]
    fn test_downscale_ignores_row_padding() {
        // Same two pixels, but with poison in the padding. Reading the padding
        // as a pixel would drag the average down, so this pins the layout.
        let img = Pixels {
            width: 2,
            height: 1,
            stride: 8,
            data: vec![0, 0, 0, 255, 255, 255, 9, 9],
        };
        let small = downscale(&img, 1);
        assert_eq!(&small.data[0..3], &[127, 127, 127]);
    }

    #[test]
    fn test_encode_capture_produces_both_sizes() {
        // 400x1 so the thumbnail must actually shrink (longest edge > 320).
        let mut rows = Vec::new();
        for _ in 0..400 {
            rows.extend_from_slice(&[1, 2, 3, 0]);
        }
        let cap = encode_capture(&dib(400, 1, 32, BI_RGB, &rows)).expect("encodes");
        assert_eq!((cap.width, cap.height), (400, 1));
        assert_eq!(&cap.full[0..2], b"BM");
        assert_eq!(&cap.thumbnail[0..2], b"BM");
        assert!(
            cap.thumbnail.len() < cap.full.len(),
            "thumbnail {} should be smaller than full {}",
            cap.thumbnail.len(),
            cap.full.len()
        );
    }

    #[test]
    fn test_base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn test_base64_handles_high_bytes() {
        // 0xFF 0xFF 0xFF -> "////"
        assert_eq!(base64_encode(&[0xFF, 0xFF, 0xFF]), "////");
        assert_eq!(base64_encode(&[0x00, 0x00, 0x00]), "AAAA");
    }

    // --- bmp_to_dib: the copy-back path -------------------------------------

    /// `decode -> to_bmp -> bmp_to_dib -> decode` must be lossless.
    ///
    /// This is the whole contract of copy-back: whatever the user pastes has to
    /// be the picture they were looking at, not a flipped or shifted version.
    #[test]
    fn test_bmp_to_dib_round_trips_through_decode() {
        // 3x2, bottom-up 24bpp DIB: row 0 is the *bottom* row of the image.
        let rows = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, // bottom: red-ish, green-ish, blue-ish
            9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, // top
        ];
        let original = decode_dib(&dib(3, 2, 24, BI_RGB, &rows)).expect("decodes");
        let bmp = to_bmp(&original);
        let back = bmp_to_dib(&bmp).expect("converts back");
        let round_tripped = decode_dib(&back).expect("decodes again");

        assert_eq!(round_tripped, original, "pixels must survive the round trip");
    }

    #[test]
    fn test_bmp_to_dib_writes_a_bottom_up_positive_height() {
        let original = decode_dib(&dib(2, -3, 24, BI_RGB, &[0u8; 24])).expect("decodes");
        let dib_bytes = bmp_to_dib(&to_bmp(&original)).expect("converts");

        let height = i32::from_le_bytes(dib_bytes[8..12].try_into().unwrap());
        assert_eq!(height, 3, "height must be positive, i.e. bottom-up");
        assert_eq!(i32::from_le_bytes(dib_bytes[4..8].try_into().unwrap()), 2);
    }

    #[test]
    fn test_bmp_to_dib_flips_top_down_rows() {
        // One column, two rows. Stored top-down (negative height) as `to_bmp`
        // writes it: row 0 is the top pixel.
        let top_down = dib(1, -2, 24, BI_RGB, &[10, 20, 30, 0, 40, 50, 60, 0]);
        let original = decode_dib(&top_down).expect("decodes");
        assert_eq!(&original.data[0..3], &[10, 20, 30], "top row first");

        let dib_bytes = bmp_to_dib(&to_bmp(&original)).expect("converts");
        let pixels = &dib_bytes[BITMAPINFOHEADER_SIZE as usize..];
        // Bottom-up means the *last* row of the image is written first.
        assert_eq!(&pixels[0..3], &[40, 50, 60], "bottom row must come first");
        assert_eq!(&pixels[4..7], &[10, 20, 30]);
    }

    #[test]
    fn test_bmp_to_dib_patches_size_image() {
        let original = decode_dib(&dib(3, 2, 24, BI_RGB, &[0u8; 24])).expect("decodes");
        let dib_bytes = bmp_to_dib(&to_bmp(&original)).expect("converts");

        let size_image = u32::from_le_bytes(dib_bytes[20..24].try_into().unwrap());
        // 3 pixels wide, 3 bytes each, padded to 4 bytes per row, 2 rows.
        assert_eq!(size_image, (row_stride(3, 3) * 2) as u32);
    }

    #[test]
    fn test_bmp_to_dib_has_no_file_header() {
        let original = decode_dib(&dib(2, 2, 24, BI_RGB, &[0u8; 16])).expect("decodes");
        let dib_bytes = bmp_to_dib(&to_bmp(&original)).expect("converts");

        // A DIB starts with `biSize`, never with "BM".
        assert_ne!(&dib_bytes[0..2], b"BM");
        assert_eq!(
            u32::from_le_bytes(dib_bytes[0..4].try_into().unwrap()),
            BITMAPINFOHEADER_SIZE
        );
    }

    #[test]
    fn test_bmp_to_dib_rejects_garbage() {
        assert!(bmp_to_dib(&[]).is_err(), "empty input");
        assert!(bmp_to_dib(&[0u8; 60]).is_err(), "missing BM magic");

        let mut not_bmp = to_bmp(&Pixels {
            width: 1,
            height: 1,
            stride: 4,
            data: vec![0; 4],
        });
        // Corrupt the bit depth to something this path cannot hand over.
        not_bmp[28..30].copy_from_slice(&8u16.to_le_bytes());
        assert!(bmp_to_dib(&not_bmp).is_err(), "8-bit is not supported");
    }

    #[test]
    fn test_bmp_to_dib_rejects_truncated_pixels() {
        let original = decode_dib(&dib(4, 4, 24, BI_RGB, &[0u8; 64])).expect("decodes");
        let bmp = to_bmp(&original);
        // Chop the last row off; the header still claims four.
        let truncated = &bmp[..bmp.len() - 4];
        assert!(bmp_to_dib(truncated).is_err(), "short pixel data must be caught");
    }

    // --- stored file naming --------------------------------------------------

    #[test]
    fn test_thumbnail_name_inserts_suffix_before_extension() {
        assert_eq!(thumbnail_name("abc.bmp"), "abc.thumb.bmp");
    }

    #[test]
    fn test_thumbnail_name_copes_with_an_unexpected_name() {
        assert_eq!(thumbnail_name("abc"), "abc.thumb.bmp");
    }
}
