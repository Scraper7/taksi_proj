import React, { useState, useEffect, useRef } from 'react'
// import ErrorBoundary from '../components/ErrorBoundary'
import 'jsoneditor/dist/jsoneditor.css'
import _ from 'lodash'
import ConstructorTab from '../../components/ConstructorTab'
import { saveAs } from 'file-saver'
import JSONEditor from 'jsoneditor'
import './styles.sass'
import { useForm, useWatch } from 'react-hook-form'

const Sandbox = () => {
  const [settings, setSettings] = useState<{[key: string]: any}>(
    {
      blocks: [{ text: 'hello world' }],
    },
  )
  const [contentKey, setContentKey] = useState(Date.now())
  const editor = useRef<JSONEditor>(null)

  const updateFrameKey = () => {
    setContentKey(Date.now())
  }

  useEffect(() => {
    const onChange = _.debounce(() => {
      try {
        if (editor.current) {
          setSettings(editor.current.get())
          localStorage.setItem('settings', JSON.stringify(editor.current.get()))
        }
        updateFrameKey()
      } catch (error) {
        console.error(error)
      }
    }, 700)
    editor.current = new JSONEditor(
      document.getElementById('settings-editor') as HTMLElement,
      {
        mode: 'code',
        onChange,
      },
      settings,
    )
    const defaultSettings = JSON.parse(localStorage.getItem('settings') || JSON.stringify(settings))
    editor.current.set(defaultSettings)
    setSettings(defaultSettings)
  }, [])

  const openFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.length && e.target.files[0]
    if (file) {
      const reader = new window.FileReader()
      reader.readAsText(file, 'UTF-8')
      reader.onload = (event) => {
        event.target && typeof event.target.result === 'string' && setSettings(JSON.parse(event.target.result))
      }
      reader.onerror = () => {
        window.alert('Ошибка при чтении файла')
      }
    }
  }

  const saveFile = () => {
    saveAs(
      new Blob([JSON.stringify(settings)], {
        type: 'application/json',
      }),
      'data.json',
    )
  }

  const form = useForm(settings.formConfg || {
    criteriaMode: 'all',
    mode: 'onChange',
  })

  const values = useWatch(
    {
      control: form.control,
    },
  )

  return (
    <>
      <div className="columns">
        <div
          className="column column--editor"
          style={{ position: 'fixed', top: 0, left: 0 }}
        >
          <div
            className="settings-editor-menu"
            style={{
              backgroundColor: '#3883fa',
              height: 30,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <label
              htmlFor="json-file"
              style={{ display: 'block', fontSize: 0 }}
            >
              <img
                src="/assets/images/openFile.svg"
                style={{ width: 20, margin: '5px 5px 0', cursor: 'pointer' }}
                alt="open"
              />
            </label>
            <input
              id="json-file"
              type="file"
              name="json-file"
              accept="application/JSON"
              style={{ display: 'none' }}
              onChange={openFile}
            />
            <img
              src="/assets/images/saveFile.svg"
              style={{ width: 20, margin: '5px 5px 0', cursor: 'pointer' }}
              onClick={saveFile}
              alt="save"
            />
            <img
              src="/assets/images/refresh.svg"
              style={{ width: 20, margin: '5px 5px 0', cursor: 'pointer' }}
              onClick={updateFrameKey}
              alt="refresh"
            />
          </div>
          <div className="settings-editor" id="settings-editor"></div>
        </div>
        <div
          className="column column--content"
          key={contentKey}
        >
          <div
            className="sandbox-content"
            key={contentKey}
            style={{ position: 'relative', minHeight: '100vh' }}
          >
            <form onSubmit={() => console.log('submit')}>
              <ConstructorTab
                form={form}
                values={values}
                settings={settings}
              />
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

export default Sandbox