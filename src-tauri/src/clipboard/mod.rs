pub mod image;
pub mod watcher;
pub mod writer;
pub use watcher::*;

/// Serializes the tests that drive the real clipboard.
///
/// The clipboard is a single global OS resource, and cargo runs the tests in one
/// binary on parallel threads — two round-trip tests overlapping would clobber
/// each other's contents and fail for reasons that have nothing to do with the
/// code. Deliberately one lock for the whole module tree: a mutex per test
/// module would not serialize against the others.
#[cfg(test)]
pub(crate) static CLIPBOARD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
