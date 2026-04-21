package me.rerere.rikkahub.ui.hooks

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp

internal fun effectiveInputBottomInsetPx(imeBottomPx: Int, navigationBarBottomPx: Int): Int {
    return if (imeBottomPx > 0) imeBottomPx else navigationBarBottomPx
}

internal fun imeScrollDeltaPx(previousImeBottomPx: Int, currentImeBottomPx: Int): Float {
    return (currentImeBottomPx - previousImeBottomPx).toFloat()
}

@Composable
fun rememberImeAwareBottomInset(): Dp {
    val density = LocalDensity.current
    val imeBottomPx = WindowInsets.ime.getBottom(density)
    val navigationBarBottomPx = WindowInsets.navigationBars.getBottom(density)
    return with(density) {
        effectiveInputBottomInsetPx(
            imeBottomPx = imeBottomPx,
            navigationBarBottomPx = navigationBarBottomPx,
        ).toDp()
    }
}
