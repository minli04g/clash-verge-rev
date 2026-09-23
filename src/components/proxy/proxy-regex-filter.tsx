import RuleRounded from '@mui/icons-material/RuleRounded'
import {
  Box,
  Button,
  IconButton,
  Menu,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { buildRegexRuleState } from './use-filter-sort'

interface Props {
  value: string
  onApply: (value: string) => void
}

export const ProxyRegexFilter = ({ value, onApply }: Props) => {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [draft, setDraft] = useState(value)
  const rule = useMemo(() => buildRegexRuleState(draft), [draft])

  const close = () => setAnchor(null)

  return (
    <>
      <IconButton
        size="small"
        color={value ? 'primary' : 'inherit'}
        title={t('proxies.page.tooltips.regexFilter')}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDraft(value)
          setAnchor(event.currentTarget)
        }}
      >
        <RuleRounded fontSize="inherit" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            width: 360,
            p: 1.5,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <Typography variant="subtitle2">
            {t('proxies.page.regexFilter.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('proxies.page.regexFilter.description')}
          </Typography>
          <TextField
            autoFocus
            multiline
            minRows={3}
            maxRows={6}
            value={draft}
            error={rule.hasRule && !rule.isValid}
            placeholder={t('proxies.page.regexFilter.placeholder')}
            helperText={
              rule.hasRule && !rule.isValid
                ? rule.error
                : t('proxies.page.regexFilter.helper')
            }
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            disabled={!rule.isValid || draft === value}
            onClick={() => {
              onApply(draft)
              close()
            }}
          >
            {t('shared.actions.save')}
          </Button>
        </Box>
      </Menu>
    </>
  )
}
