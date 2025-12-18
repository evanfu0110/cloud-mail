<template>
  <div class="pool-container">
    <div class="header">
      <div class="title">{{$t('mailboxPool')}}</div>
      <div class="actions">
        <el-button type="primary" @click="showGenDialog = true">
          <Icon icon="mdi:plus" width="18" height="18" style="margin-right: 4px" />
          {{$t('batchGenerate')}}
        </el-button>
        <el-button type="danger" @click="handleClear">
          <Icon icon="mdi:trash-can-outline" width="18" height="18" style="margin-right: 4px" />
          {{$t('clearPool')}}
        </el-button>
        <el-button type="success" @click="copyAllEmails">
          <Icon icon="mdi:content-copy" width="18" height="18" style="margin-right: 4px" />
          {{$t('copyAll')}}
        </el-button>
      </div>
    </div>

    <el-table :data="list" style="width: 100%; margin-top: 20px" v-loading="loading">
      <el-table-column prop="email" :label="$t('emailAccount')" min-width="200" />
      <el-table-column prop="createTime" :label="$t('tabRegisteredAt')" width="180">
        <template #default="scope">
          {{ formatDate(scope.row.createTime) }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('action')" width="120" fixed="right">
        <template #default="scope">
          <el-button link type="danger" @click="handleDelete(scope.row)">{{$t('delete')}}</el-button>
          <el-button link type="primary" @click="copyEmail(scope.row.email)">{{$t('copy')}}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination" v-if="total > 0">
      <el-pagination
          v-model:current-page="params.num"
          v-model:page-size="params.size"
          layout="total, prev, pager, next"
          :total="total"
          @current-change="getList"
      />
    </div>

    <!-- 生成对话框 -->
    <el-dialog v-model="showGenDialog" :title="$t('batchGenerate')" width="400px">
      <el-form :model="genForm" label-width="80px">
        <el-form-item :label="$t('genCount')">
          <el-input-number v-model="genForm.count" :min="1" :max="1000" />
        </el-form-item>
        <el-form-item :label="$t('prefix')">
          <el-input v-model="genForm.prefix" placeholder="可选" />
        </el-form-item>
        <el-form-item :label="$t('suffixLength')">
          <el-input-number v-model="genForm.length" :min="4" :max="20" />
        </el-form-item>
        <el-form-item :label="$t('domain')">
          <el-select v-model="genForm.domain">
            <el-option v-for="item in domainList" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenDialog = false">{{$t('cancel')}}</el-button>
        <el-button type="primary" @click="handleGenerate" :loading="genLoading">{{$t('confirm')}}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/store/setting.js'
import http from '@/axios/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'

const { t } = useI18n()
const settingStore = ref(useSettingStore())
const loading = ref(false)
const list = ref([])
const total = ref(0)
const domainList = ref([])

const params = reactive({
  num: 1,
  size: 20
})

const showGenDialog = ref(false)
const genLoading = ref(false)
const genForm = reactive({
  count: 10,
  prefix: '',
  length: 6,
  domain: ''
})

onMounted(() => {
  domainList.value = settingStore.value.settings.domainList.map(d => d.replace('@', ''))
  if (domainList.value.length > 0) {
    genForm.domain = domainList.value[0]
  }
  getList()
})

async function getList() {
  loading.value = true
  try {
    const data = await http.get('/account/pool/list', { params })
    list.value = data.list
    total.value = data.total
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  genLoading.value = true
  try {
    const data = await http.post('/account/batch-generate', genForm)
    ElMessage.success(t('generateSuccess'))
    showGenDialog.value = false
    getList()
  } catch (error) {
    console.error(error)
  } finally {
    genLoading.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(t('delConfirm', { msg: row.email }), t('warning'), { type: 'warning' })
    await http.delete('/account/pool/delete', { params: { accountIds: row.accountId } })
    ElMessage.success(t('delSuccessMsg'))
    getList()
  } catch (error) {}
}

async function handleClear() {
  try {
    await ElMessageBox.confirm(t('confirmClearPool'), t('warning'), { type: 'warning' })
    await http.delete('/account/pool/clear')
    ElMessage.success(t('clearSuccess'))
    getList()
  } catch (error) {}
}

function copyEmail(email) {
  navigator.clipboard.writeText(email).then(() => {
    ElMessage.success(t('copySuccessMsg'))
  })
}

function copyAllEmails() {
  const emails = list.value.map(i => i.email).join('\n')
  navigator.clipboard.writeText(emails).then(() => {
    ElMessage.success(t('copySuccessMsg'))
  })
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style lang="scss" scoped>
.pool-container {
  padding: 20px;
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    .title {
      font-size: 20px;
      font-weight: bold;
      color: var(--el-text-color-primary);
    }
  }
  .pagination {
    margin-top: 20px;
    display: flex;
    justify-content: center;
  }
}
</style>
